local ffi = require("ffi")
local socket = {}
local e = {}
local errno = {}

do
    local C

    if ffi.os == "Windows" then
        C = assert(ffi.load("ws2_32"))
    else
        C = ffi.C
    end

    local M = {}

    local function generic_function(C_name, cdef, alias, size_error_handling)
        ffi.cdef(cdef)

        alias = alias or C_name
        local func_name = alias
        local func = C[C_name]

        if size_error_handling == false then
            socket[func_name] = func
        elseif size_error_handling then
            socket[func_name] = function(...)
                local len = func(...)
                if len < 0 then
                    return nil, socket.lasterror()
                end

                return len
            end
        else
            socket[func_name] = function(...)
                local ret = func(...)

                if ret == 0 then
                    return true
                end

                return nil, socket.lasterror()
            end
        end
    end

    ffi.cdef[[
        struct in_addr {
            uint32_t s_addr;
        };

        struct in6_addr {
            union {
                uint8_t u6_addr8[16];
                uint16_t u6_addr16[8];
                uint32_t u6_addr32[4];
            } u6_addr;
        };
    ]]

    -- https://www.cs.dartmouth.edu/~sergey/cs60/on-sockaddr-structs.txt

    if ffi.os == "OSX" then
        ffi.cdef[[
            struct sockaddr {
                uint8_t sa_len;
                uint8_t sa_family;
                char sa_data[14];
            };

            struct sockaddr_in {
                uint8_t sin_len;
                uint8_t sin_family;
                uint16_t sin_port;
                struct in_addr sin_addr;
                char sin_zero[8];
            };

            struct sockaddr_in6 {
                uint8_t sin6_len;
                uint8_t sin6_family;
                uint16_t sin6_port;
                uint32_t sin6_flowinfo;
                struct in6_addr sin6_addr;
                uint32_t sin6_scope_id;
            };
        ]]
    elseif ffi.os == "Windows" then
        ffi.cdef[[
            struct sockaddr {
                uint16_t sa_family;
                char sa_data[14];
            };

            struct sockaddr_in {
                int16_t sin_family;
                uint16_t sin_port;
                struct in_addr sin_addr;
                uint8_t sin_zero[8];
            };

            struct sockaddr_in6 {
                int16_t sin6_family;
                uint16_t sin6_port;
                uint32_t sin6_flowinfo;
                struct in6_addr sin6_addr;
                uint32_t sin6_scope_id;
            };
        ]]
    else -- posix
        ffi.cdef[[
            struct sockaddr {
                uint16_t sa_family;
                char sa_data[14];
            };

            struct sockaddr_in {
                uint16_t sin_family;
                uint16_t sin_port;
                struct in_addr sin_addr;
                char sin_zero[8];
            };

            struct sockaddr_in6 {
                uint16_t sin6_family;
                uint16_t sin6_port;
                uint32_t sin6_flowinfo;
                struct in6_addr sin6_addr;
                uint32_t sin6_scope_id;
            };
        ]]
    end

    if ffi.os == "Windows" then
        ffi.cdef[[
            typedef size_t SOCKET;

            struct addrinfo {
                int ai_flags;
                int ai_family;
                int ai_socktype;
                int ai_protocol;
                size_t ai_addrlen;
                char *ai_canonname;
                struct sockaddr *ai_addr;
                struct addrinfo *ai_next;
            };
        ]]
        socket.INVALID_SOCKET = ffi.new("SOCKET", -1)
    elseif ffi.os == "OSX" then
        ffi.cdef[[
            typedef int32_t SOCKET;

            struct addrinfo {
                int ai_flags;
                int ai_family;
                int ai_socktype;
                int ai_protocol;
                uint32_t ai_addrlen;
                char *ai_canonname;
                struct sockaddr *ai_addr;
                struct addrinfo *ai_next;
            };
        ]]
        socket.INVALID_SOCKET = -1
    else
        ffi.cdef[[
            typedef int32_t SOCKET;

            struct addrinfo {
                int ai_flags;
                int ai_family;
                int ai_socktype;
                int ai_protocol;
                uint32_t ai_addrlen;
                struct sockaddr *ai_addr;
                char *ai_canonname;
                struct addrinfo *ai_next;
            };
        ]]
        socket.INVALID_SOCKET = -1
    end

    assert(ffi.sizeof("struct sockaddr") == 16)
    assert(ffi.sizeof("struct sockaddr_in") == 16)

    if ffi.os == "Windows" then
        ffi.cdef[[

            struct pollfd {
                SOCKET fd;
                short events;
                short revents;
            };
            int WSAPoll(struct pollfd *fds, unsigned long int nfds, int timeout);

            uint32_t GetLastError();
            uint32_t FormatMessageA(
                uint32_t dwFlags,
                const void* lpSource,
                uint32_t dwMessageId,
                uint32_t dwLanguageId,
                char* lpBuffer,
                uint32_t nSize,
                va_list *Arguments
            );
        ]]

        local function WORD(low, high)
            return bit.bor(low , bit.lshift(high , 8))
        end

        do
            ffi.cdef[[int GetLastError();]]

            local FORMAT_MESSAGE_FROM_SYSTEM = 0x00001000
            local FORMAT_MESSAGE_IGNORE_INSERTS = 0x00000200
            local flags = bit.bor(FORMAT_MESSAGE_IGNORE_INSERTS, FORMAT_MESSAGE_FROM_SYSTEM)

            local cache = {}

            function socket.lasterror(num)
                num = num or ffi.C.GetLastError()

                if not cache[num] then
                    local buffer = ffi.new("char[512]")
                    local len = ffi.C.FormatMessageA(flags, nil, num, 0, buffer, ffi.sizeof(buffer), nil)
                    cache[num] = ffi.string(buffer, len - 2)
                end

                return cache[num], num
            end
        end

        do
            ffi.cdef[[int WSAStartup(uint16_t version, void *wsa_data);]]

            local wsa_data

            if jit.arch == "x64" then
                wsa_data = ffi.typeof([[struct {
                    uint16_t wVersion;
                    uint16_t wHighVersion;
                    unsigned short iMax_M;
                    unsigned short iMaxUdpDg;
                    char * lpVendorInfo;
                    char szDescription[257];
                    char szSystemStatus[129];
                }]])
            else
                wsa_data = ffi.typeof([[struct {
                    uint16_t wVersion;
                    uint16_t wHighVersion;
                    char szDescription[257];
                    char szSystemStatus[129];
                    unsigned short iMax_M;
                    unsigned short iMaxUdpDg;
                    char * lpVendorInfo;
                }]])
            end

            function socket.initialize()
                local data = wsa_data()

                if C.WSAStartup(WORD(2, 2), data) == 0 then
                    return data
                end

                return nil, socket.lasterror()
            end
        end

        do
            ffi.cdef[[int WSACleanup();]]

            function socket.shutdown()
                if C.WSACleanup() == 0 then
                    return true
                end

                return nil, socket.lasterror()
            end
        end

        if jit.arch ~= "x64" then -- xp or something
            ffi.cdef[[int WSAAddressToStringA(struct sockaddr *, unsigned long, void *, char *, unsigned long *);]]

            function socket.inet_ntop(family, pAddr, strptr, strlen)
                -- win XP: http://memset.wordpress.com/2010/10/09/inet_ntop-for-win32/
                local srcaddr = ffi.new("struct sockaddr_in")
                ffi.copy(srcaddr.sin_addr, pAddr, ffi.sizeof(srcaddr.sin_addr))
                srcaddr.sin_family = family
                local len = ffi.new("unsigned long[1]", strlen)
                C.WSAAddressToStringA(ffi.cast("struct sockaddr *", srcaddr), ffi.sizeof(srcaddr), nil, strptr, len)
                return strptr
            end
        end

        generic_function("closesocket", "int closesocket(SOCKET s);", "close")

        do
            ffi.cdef[[int ioctlsocket(SOCKET s, long cmd, unsigned long* argp);]]

            local IOCPARM_MASK    = 0x7
            local IOC_IN          = 0x80000000
            local function _IOW(x,y,t)
                return bit.bor(IOC_IN, bit.lshift(bit.band(ffi.sizeof(t),IOCPARM_MASK),16), bit.lshift(x,8), y)
            end

            local FIONBIO = _IOW(string.byte'f', 126, "uint32_t") -- -2147195266 -- 2147772030ULL

            function socket.blocking(fd, b)
                local ret = C.ioctlsocket(fd, FIONBIO, ffi.new("int[1]", b and 0 or 1))
                if ret == 0 then
                    return true
                end

                return nil, socket.lasterror()
            end
        end

        function socket.poll(fds, ndfs, timeout)
            local ret = C.WSAPoll(fds, ndfs, timeout)
            if ret < 0 then
                return nil, socket.lasterror()
            end
            return ret
        end
    else
        ffi.cdef[[
            struct pollfd {
                SOCKET fd;
                short events;
                short revents;
            };

            int poll(struct pollfd *fds, unsigned long nfds, int timeout);
        ]]

        do
            local cache = {}

            function socket.lasterror(num)
                num = num or ffi.errno()

                if not cache[num] then
                    local err = ffi.string(ffi.C.strerror(num))
                    cache[num] = err == "" and tostring(num) or err
                end

                return cache[num], num
            end
        end

        generic_function("close", "int close(SOCKET s);")

        do
            ffi.cdef[[int fcntl(int, int, ...);]]

            local F_GETFL = 3
            local F_SETFL = 4
            local O_NONBLOCK = 04000

            if ffi.os == "OSX" then
                O_NONBLOCK = 0x0004
            end
            function socket.blocking(fd, b)
                local flags = ffi.C.fcntl(fd, F_GETFL, 0)

                if flags < 0 then
                    -- error
                    return nil, socket.lasterror()
                end

                if b then
                    flags = bit.band(flags, bit.bnot(O_NONBLOCK))
                else
                    flags = bit.bor(flags, O_NONBLOCK)
                end

                local ret = ffi.C.fcntl(fd, F_SETFL, ffi.new("int", flags))

                if ret < 0 then
                    return nil, socket.lasterror()
                end

                return true
            end
        end

        function socket.poll(fds, ndfs, timeout)
            local ret = C.poll(fds, ndfs, timeout)
            if ret < 0 then
                return nil, socket.lasterror()
            end
            return ret
        end
    end


    ffi.cdef[[
        char *strerror(int errnum);
        int getaddrinfo(const char *node, const char *service, const struct addrinfo *hints, struct addrinfo **res);
        int getnameinfo(const struct sockaddr* sa, uint32_t salen, char* host, size_t hostlen, char* serv, size_t servlen, int flags);
        void freeaddrinfo(struct addrinfo *ai);
        const char *gai_strerror(int errcode);
        char *inet_ntoa(struct in_addr in);
        uint16_t ntohs(uint16_t netshort);
    ]]

    function socket.getaddrinfo(node_name, service_name, hints, result)
        local ret = C.getaddrinfo(node_name, service_name, hints, result)
        if ret == 0 then
            return true
        end

        return nil, ffi.string(socket.lasterror(ret))
    end

    function socket.getnameinfo(address, length, host, hostlen, serv, servlen, flags)
        local ret = C.getnameinfo(address, length, host, hostlen, serv, servlen, flags)
        if ret == 0 then
            return true
        end

        return nil, ffi.string(socket.lasterror(ret))
    end

    do
        ffi.cdef[[const char *inet_ntop(int __af, const void *__cp, char *__buf, unsigned int __len);]]

        function socket.inet_ntop(family, addrinfo, strptr, strlen)
            if C.inet_ntop(family, addrinfo, strptr, strlen) == nil then
                return nil, socket.lasterror()
            end

            return strptr
        end
    end

    do
        ffi.cdef[[SOCKET socket(int af, int type, int protocol);]]

        function socket.create(af, type, protocol)
            local fd = C.socket(af, type, protocol)

            if fd <= 0 then
                return nil, socket.lasterror()
            end

            return fd
        end
    end

    generic_function("shutdown", "int shutdown(SOCKET s, int how);")

    generic_function("setsockopt", "int setsockopt(SOCKET s, int level, int optname, const void* optval, uint32_t optlen);")
    generic_function("getsockopt", "int getsockopt(SOCKET s, int level, int optname, void *optval, uint32_t *optlen);")

    generic_function("accept", "SOCKET accept(SOCKET s, struct sockaddr *, int *);", nil, false)
    generic_function("bind", "int bind(SOCKET s, const struct sockaddr* name, int namelen);")
    generic_function("connect", "int connect(SOCKET s, const struct sockaddr * name, int namelen);")

    generic_function("listen", "int listen(SOCKET s, int backlog);")
    generic_function("recv", "int recv(SOCKET s, char* buf, int len, int flags);", nil, true)
    generic_function("recvfrom", "int recvfrom(SOCKET s, char* buf, int len, int flags, struct sockaddr *src_addr, unsigned int *addrlen);", nil, true)

    generic_function("send", "int send(SOCKET s, const char* buf, int len, int flags);", nil, true)
    generic_function("sendto", "int sendto(SOCKET s, const char* buf, int len, int flags, const struct sockaddr* to, int tolen);", nil, true)

    generic_function("getpeername", "int getpeername(SOCKET s, struct sockaddr *, unsigned int *);")
    generic_function("getsockname", "int getsockname(SOCKET s, struct sockaddr *, unsigned int *);")

    socket.inet_ntoa = C.inet_ntoa
    socket.ntohs = C.ntohs

    function socket.poll(fd, events, revents)

    end

    e = {
        TCP_NODELAY = 1,
        TCP_MAXSEG = 2,
        TCP_CORK = 3,
        TCP_KEEPIDLE = 4,
        TCP_KEEPINTVL = 5,
        TCP_KEEPCNT = 6,
        TCP_SYNCNT = 7,
        TCP_LINGER2 = 8,
        TCP_DEFER_ACCEPT = 9,
        TCP_WINDOW_CLAMP = 10,
        TCP_INFO = 11,
        TCP_QUICKACK = 12,
        TCP_CONGESTION = 13,
        TCP_MD5SIG = 14,
        TCP_THIN_LINEAR_TIMEOUTS = 16,
        TCP_THIN_DUPACK = 17,
        TCP_USER_TIMEOUT = 18,
        TCP_REPAIR = 19,
        TCP_REPAIR_QUEUE = 20,
        TCP_QUEUE_SEQ = 21,
        TCP_REPAIR_OPTIONS = 22,
        TCP_FASTOPEN = 23,
        TCP_TIMESTAMP = 24,
        TCP_NOTSENT_LOWAT = 25,
        TCP_CC_INFO = 26,
        TCP_SAVE_SYN = 27,
        TCP_SAVED_SYN = 28,
        TCP_REPAIR_WINDOW = 29,
        TCP_FASTOPEN_CONNECT = 30,
        TCP_ULP = 31,
        TCP_MD5SIG_EXT = 32,
        TCP_FASTOPEN_KEY = 33,
        TCP_FASTOPEN_NO_COOKIE = 34,
        TCP_ZEROCOPY_RECEIVE = 35,
        TCP_INQ = 36,

        AF_INET = 2,
        AF_INET6 = 10,
        AF_UNSPEC = 0,

        AF_UNIX = 1,
        AF_AX25 = 3,
        AF_IPX = 4,
        AF_APPLETALK = 5,
        AF_NETROM = 6,
        AF_BRIDGE = 7,
        AF_AAL5 = 8,
        AF_X25 = 9,

        INET6_ADDRSTRLEN = 46,
        INET_ADDRSTRLEN = 16,

        SO_DEBUG = 1,
        SO_REUSEADDR = 2,
        SO_TYPE = 3,
        SO_ERROR = 4,
        SO_DONTROUTE = 5,
        SO_BROADCAST = 6,
        SO_SNDBUF = 7,
        SO_RCVBUF = 8,
        SO_SNDBUFFORCE = 32,
        SO_RCVBUFFORCE = 33,
        SO_KEEPALIVE = 9,
        SO_OOBINLINE = 10,
        SO_NO_CHECK = 11,
        SO_PRIORITY = 12,
        SO_LINGER = 13,
        SO_BSDCOMPAT = 14,
        SO_REUSEPORT = 15,
        SO_PASSCRED = 16,
        SO_PEERCRED = 17,
        SO_RCVLOWAT = 18,
        SO_SNDLOWAT = 19,
        SO_RCVTIMEO = 20,
        SO_SNDTIMEO = 21,
        SO_SECURITY_AUTHENTICATION = 22,
        SO_SECURITY_ENCRYPTION_TRANSPORT = 23,
        SO_SECURITY_ENCRYPTION_NETWORK = 24,
        SO_BINDTODEVICE = 25,
        SO_ATTACH_FILTER = 26,
        SO_DETACH_FILTER = 27,
        SO_GET_FILTER = 26,
        SO_PEERNAME = 28,
        SO_TIMESTAMP = 29,
        SO_ACCEPTCONN = 30,
        SO_PEERSEC = 31,
        SO_PASSSEC = 34,
        SO_TIMESTAMPNS = 35,
        SO_MARK = 36,
        SO_TIMESTAMPING = 37,
        SO_PROTOCOL = 38,
        SO_DOMAIN = 39,
        SO_RXQ_OVFL = 40,
        SO_WIFI_STATUS = 41,
        SO_PEEK_OFF = 42,
        SO_NOFCS = 43,
        SO_LOCK_FILTER = 44,
        SO_SELECT_ERR_QUEUE = 45,
        SO_BUSY_POLL = 46,
        SO_MAX_PACING_RATE = 47,
        SO_BPF_EXTENSIONS = 48,
        SO_INCOMING_CPU = 49,
        SO_ATTACH_BPF = 50,
        SO_DETACH_BPF = 27,
        SO_ATTACH_REUSEPORT_CBPF = 51,
        SO_ATTACH_REUSEPORT_EBPF = 52,
        SO_CNX_ADVICE = 53,
        SO_MEMINFO = 55,
        SO_INCOMING_NAPI_ID = 56,
        SO_COOKIE = 57,
        SO_PEERGROUPS = 59,
        SO_ZEROCOPY = 60,
        SO_TXTIME = 61,
        SOL_SOCKET = 1,
        SOL_TCP = 6,

        SOMAXCONN = 128,

        IPPROTO_IP = 0,
        IPPROTO_HOPOPTS = 0,
        IPPROTO_ICMP = 1,
        IPPROTO_IGMP = 2,
        IPPROTO_IPIP = 4,
        IPPROTO_TCP = 6,
        IPPROTO_EGP = 8,
        IPPROTO_PUP = 12,
        IPPROTO_UDP = 17,
        IPPROTO_IDP = 22,
        IPPROTO_TP = 29,
        IPPROTO_DCCP = 33,
        IPPROTO_IPV6 = 41,
        IPPROTO_ROUTING = 43,
        IPPROTO_FRAGMENT = 44,
        IPPROTO_RSVP = 46,
        IPPROTO_GRE = 47,
        IPPROTO_ESP = 50,
        IPPROTO_AH = 51,
        IPPROTO_ICMPV6 = 58,
        IPPROTO_NONE = 59,
        IPPROTO_DSTOPTS = 60,
        IPPROTO_MTP = 92,
        IPPROTO_ENCAP = 98,
        IPPROTO_PIM = 103,
        IPPROTO_COMP = 108,
        IPPROTO_SCTP = 132,
        IPPROTO_UDPLITE = 136,
        IPPROTO_RAW = 255,

        SOCK_STREAM = 1,
        SOCK_DGRAM = 2,
        SOCK_RAW = 3,
        SOCK_RDM = 4,
        SOCK_SEQPACKET = 5,
        SOCK_DCCP = 6,
        SOCK_PACKET = 10,
        SOCK_CLOEXEC = 02000000,
        SOCK_NONBLOCK = 04000,

        AI_PASSIVE = 0x00000001,
        AI_CANONNAME = 0x00000002,
        AI_NUMERICHOST = 0x00000004,
        AI_NUMERICSERV = 0x00000008,
        AI_ALL = 0x00000100,
        AI_ADDRCONFIG = 0x00000400,
        AI_V4MAPPED = 0x00000800,
        AI_NON_AUTHORITATIVE = 0x00004000,
        AI_SECURE = 0x00008000,
        AI_RETURN_PREFERRED_NAMES = 0x00010000,
        AI_FQDN = 0x00020000,
        AI_FILESERVER = 0x00040000,

        POLLIN = 0x0001,
        POLLPRI = 0x0002,
        POLLOUT = 0x0004,
        POLLRDNORM = 0x0040,
        POLLWRNORM = 0x0004,
        POLLRDBAND = 0x0080,
        POLLWRBAND = 0x0100,
        POLLEXTEND = 0x0200,
        POLLATTRIB = 0x0400,
        POLLNLINK = 0x0800,
        POLLWRITE = 0x1000,
        POLLERR = 0x0008,
        POLLHUP = 0x0010,
        POLLNVAL = 0x0020,

        MSG_OOB = 0x01,
        MSG_PEEK = 0x02,
        MSG_DONTROUTE = 0x04,
        MSG_CTRUNC = 0x08,
        MSG_PROXY = 0x10,
        MSG_TRUNC = 0x20,
        MSG_DONTWAIT = 0x40,
        MSG_EOR = 0x80,
        MSG_WAITALL = 0x100,
        MSG_FIN = 0x200,
        MSG_SYN = 0x400,
        MSG_CONFIRM = 0x800,
        MSG_RST = 0x1000,
        MSG_ERRQUEUE = 0x2000,
        MSG_NOSIGNAL = 0x4000,
        MSG_MORE = 0x8000,
        MSG_WAITFORONE = 0x10000,
        MSG_CMSG_CLOEXEC = 0x40000000,
    }

    errno = {
        EAGAIN = 11,
        EWOULDBLOCK = 11, -- is errno.EAGAIN
        EINVAL = 22,
        ENOTSOCK = 88,
        ECONNRESET = 104,
        EINPROGRESS = 115,
    }

    if ffi.os == "Windows" then
        e.SO_SNDLOWAT = 4099
        e.SO_REUSEADDR = 4
        e.SO_KEEPALIVE = 8
        e.SOMAXCONN = 2147483647
        e.AF_INET6 = 23
        e.SO_RCVTIMEO = 4102
        e.SOL_SOCKET = 65535
        e.SO_LINGER = 128
        e.SO_OOBINLINE = 256
        e.POLLWRNORM = 16
        e.SO_ERROR = 4103
        e.SO_BROADCAST = 32
        e.SO_ACCEPTCONN = 2
        e.SO_RCVBUF = 4098
        e.SO_SNDTIMEO = 4101
        e.POLLIN = 768
        e.POLLPRI = 1024
        e.SO_TYPE = 4104
        e.POLLRDBAND = 512
        e.POLLWRBAND = 32
        e.SO_SNDBUF = 4097
        e.POLLNVAL = 4
        e.POLLHUP = 2
        e.POLLERR = 1
        e.POLLRDNORM = 256
        e.SO_DONTROUTE = 16
        e.SO_RCVLOWAT = 4100

        errno.EINVAL = 10022
        errno.EAGAIN = 10035 -- Note: Does not exist on Windows
        errno.EWOULDBLOCK = 10035
        errno.EINPROGRESS = 10036
        errno.ENOTSOCK = 10038
        errno.ECONNRESET = 10054
    end

    if ffi.os == "OSX" then
        e.SOL_SOCKET = 0xffff
        e.SO_DEBUG = 0x0001
        e.SO_ACCEPTCONN = 0x0002
        e.SO_REUSEADDR = 0x0004
        e.SO_KEEPALIVE = 0x0008
        e.SO_DONTROUTE = 0x0010
        e.SO_BROADCAST = 0x0020

        errno.EINVAL = 22
        errno.EAGAIN = 35
        errno.EWOULDBLOCK = errno.EAGAIN
        errno.EINPROGRESS = 36
        errno.ENOTSOCK = 38
        errno.ECONNRESET = 54
    end

    if socket.initialize then
        assert(socket.initialize())
    end
end

local function capture_flags(what)
    local flags = {}
    local reverse = {}
    for k, v in pairs(e) do
        if k:sub(0, #what) == what then
            k = k:sub(#what + 1):lower()
            reverse[v] = k
            flags[k] = v
        end
    end
    return {
        lookup = flags,
        reverse = reverse,
        strict_reverse = function(key)
            if not key then
                error("invalid " .. what:sub(0, -2) .. " flag: nil")
            end
            if not reverse[key] then
                error("invalid "..what:sub(0, -2).." flag: " .. key, 2)
            end
            return reverse[key]
        end,
        strict_lookup = function(key)
            if not key then
                error("invalid " .. what:sub(0, -2) .. " flag: nil")
            end
            if not flags[key] then
                error("invalid "..what:sub(0, -2).." flag: " .. key, 2)
            end
            return flags[key]
        end
    }
end

local SOCK = capture_flags("SOCK_")
local AF = capture_flags("AF_")
local IPPROTO = capture_flags("IPPROTO_")
local AI = capture_flags("AI_")
local SOL = capture_flags("SOL_")
local SO = capture_flags("SO_")
local TCP = capture_flags("TCP_")
local POLL = capture_flags("POLL")

local function table_to_flags(flags, valid_flags, operation)
	if type(flags) == "string" then
		flags = {flags}
    end
    operation = operation or bit.band

	local out = 0

	for k, v in pairs(flags) do
		local flag = valid_flags[v] or valid_flags[k]
		if not flag then
            error("invalid flag " .. tostring(v), 2)
		end

		out = operation(out, tonumber(flag))
	end

	return out
end

local function flags_to_table(flags, valid_flags, operation)
    if not flags then return valid_flags.default_valid_flag end
    operation = operation or bit.band

	local out = {}

	for k, v in pairs(valid_flags) do
		if operation(flags, v) > 0 then
			out[k] = true
		end
	end

	return out
end

local M = {}

local timeout_messages = {}
timeout_messages[errno.EINPROGRESS] = true
timeout_messages[errno.EAGAIN] = true
timeout_messages[errno.EWOULDBLOCK] = true

function M.poll(socket, flags, timeout)
    local pfd = ffi.new("struct pollfd[1]", {{
        fd = socket.fd,
        events = table_to_flags(flags, POLL.lookup, bit.bor),
        revents = 0,
    }})
    local ok, err = socket.poll(pfd, 1, timeout or 0)
    if not ok then return ok, err end
    return flags_to_table(pfd[0].revents, POLL.lookup, bit.bor), ok
end

local function addrinfo_get_ip(self)
    if self.addrinfo.ai_addr == nil then
        return nil
    end
    local str = ffi.new("char[256]")
    local addr = assert(socket.inet_ntop(AF.lookup[self.family], ffi.cast("struct sockaddr_in*", self.addrinfo.ai_addr).sin_addr, str, ffi.sizeof(str)))
    return ffi.string(addr)
end

local function addrinfo_get_port(self)
    if self.addrinfo.ai_addr == nil then
        return nil
    end
    if self.family == "inet" then
        return socket.ntohs(ffi.cast("struct sockaddr_in*", self.addrinfo.ai_addr).sin_port)
    elseif self.family == "inet6" then
        return socket.ntohs(ffi.cast("struct sockaddr_in6*", self.addrinfo.ai_addr).sin6_port)
    end

    return nil, "unknown family " .. tostring(self.family)
end

local function addrinfo_to_table(res, host, service)
    local info = {}

    if res.ai_canonname ~= nil then
        info.canonical_name = ffi.string(res.ai_canonname)
    end

    info.host = host ~= "*" and host or nil
    info.service = service
    info.family = AF.reverse[res.ai_family]
    info.socket_type = SOCK.reverse[res.ai_socktype]
    info.protocol = IPPROTO.reverse[res.ai_protocol]
    info.flags = flags_to_table(res.ai_flags, AI.lookup, bit.band)
    info.addrinfo = res
    info.get_ip = addrinfo_get_ip
    info.get_port = addrinfo_get_port

    return info
end

function M.get_address_info(data)
    local hints

    if data.socket_type or data.protocol or data.flags or data.family then
        hints = ffi.new("struct addrinfo", {
            ai_family = data.family and AF.strict_lookup(data.family) or nil,
            ai_socktype = data.socket_type and SOCK.strict_lookup(data.socket_type) or nil,
            ai_protocol = data.protocol and IPPROTO.strict_lookup(data.protocol) or nil,
            ai_flags = data.flags and table_to_flags(data.flags, AI.lookup, bit.bor) or nil,
        })
    end

    local out = ffi.new("struct addrinfo*[1]")

    local ok, err = socket.getaddrinfo(
        data.host ~= "*" and data.host or nil,
        data.service and tostring(data.service) or nil,
        hints,
        out
    )

    if not ok then return ok, err end

    local tbl = {}

    local res = out[0]

    while res ~= nil do
        table.insert(tbl, addrinfo_to_table(res, data.host, data.service))

        res = res.ai_next
    end

    --ffi.C.freeaddrinfo(out[0])

    return tbl
end

function M.find_first_address(host, service, options)
    options = options or {}

    local info = {}
    info.host = host
    info.service = service

    info.family = options.family or "inet"
    info.socket_type = options.socket_type or "stream"
    info.protocol = options.protocol or "tcp"
    info.flags = options.flags

    if host == "*" then
        info.flags = info.flags or {}
        table.insert(info.flags, "passive")
    end

    local addrinfo, err = M.get_address_info(info)

    if not addrinfo then
        return nil, err
    end

    if not addrinfo[1] then
        return nil, "no addresses found (empty address info table)"
    end

    for _, v in ipairs(addrinfo) do
        if v.family == info.family and v.socket_type == info.socket_type and v.protocol == info.protocol then
            return v
        end
    end

    return addrinfo[1]
end


do
    local meta = {}
    meta.__index = meta

    function meta:__tostring()
        return string.format("socket[%s-%s-%s][%s]", self.family, self.socket_type, self.protocol, self.fd)
    end

    function M.create(family, socket_type, protocol)
        local fd, err, num = socket.create(AF.strict_lookup(family), SOCK.strict_lookup(socket_type), IPPROTO.strict_lookup(protocol))

        if not fd then return fd, err, num end

        return setmetatable({
            fd = fd,
            family = family,
            socket_type = socket_type,
            protocol = protocol,
            blocking = true,
        }, meta)
    end

    function meta:close()
        if self.on_close then
            self:on_close()
        end
        return socket.close(self.fd)
    end

    function meta:set_blocking(b)
        local ok, err, num = socket.blocking(self.fd, b)
        if ok then
            self.blocking = b
        end
        return ok, err, num
    end

    function meta:set_option(key, val, level)
        level = level or "socket"

        if type(val) == "boolean" then
            val = ffi.new("int[1]", val and 1 or 0)
        elseif type(val) == "number" then
            val = ffi.new("int[1]", val)
        elseif type(val) ~= "cdata" then
            error("unknown value type: " .. type(val))
        end

        local env = SO
        if level == "tcp" then
            env = TCP
        end

        return socket.setsockopt(self.fd, SOL.strict_lookup(level), env.strict_lookup(key), ffi.cast("void *", val), ffi.sizeof(val))
    end

    function meta:connect(host, service)
        local res

        if type(host) == "table" and host.addrinfo then
            res = host
        else
            local res_, err = M.find_first_address(host, service, {
                family = self.family,
                socket_type = self.socket_type,
                protocol = self.protocol
            })

            if not res_ then
                return res_, err
            end

            res = res_
        end

        local ok, err, num = socket.connect(self.fd, res.addrinfo.ai_addr, res.addrinfo.ai_addrlen)

        if not ok and not self.blocking then
            if timeout_messages[num] then
                self.timeout_connected = {host, service}
                return true
            end
        elseif self.on_connect then
            self:on_connect(host, service)
        end

        if not ok then
            return ok, err, num
        end

        return true
    end

    function meta:poll_connect()
        if self.on_connect and self.timeout_connected and self:is_connected() then
            local ok, err, num = self:on_connect(unpack(self.timeout_connected))
            self.timeout_connected = nil
            return ok, err, num
        end

        return nil, "timeout"
    end

    function meta:bind(host, service)
        if host == "*" then
            host = nil
        end

        if type(service) == "number" then
            service = tostring(service)
        end

        local res

        if type(host) == "table" and host.addrinfo then
            res = host
        else
            local res_, err = M.find_first_address(host, service, {
                family = self.family,
                socket_type = self.socket_type,
                protocol = self.protocol
            })

            if not res_ then
                return res_, err
            end

            res = res_
        end

        return socket.bind(self.fd, res.addrinfo.ai_addr, res.addrinfo.ai_addrlen)
    end

    function meta:listen(max_connections)
        max_connections = max_connections or e.SOMAXCONN
        return socket.listen(self.fd, max_connections)
    end

    function meta:accept()
        local address = ffi.new("struct sockaddr_in[1]")
        local fd, err = socket.accept(self.fd, ffi.cast("struct sockaddr *", address), ffi.new("unsigned int[1]", ffi.sizeof(address)))

        if fd ~= socket.INVALID_SOCKET then
            local client = setmetatable({
                fd = fd,
                family = "unknown",
                socket_type = "unknown",
                protocol = "unknown",
                blocking = true,
            }, meta)

            if self.debug then
                print(tostring(self), ": accept client: ", tostring(client))
            end

            return client
        end

        local err, num = socket.lasterror()

        if not self.blocking and timeout_messages[num] then
            return nil, "timeout", num
        end

        if self.debug then
            print(tostring(self), ": accept error", num, ":", err)
        end

        return nil, err, num
    end

    function meta:is_connected()
        local ip, service, num = self:get_peer_name()
        local ip2, service2, num2 = self:get_name()

        if not ip and (num == errno.ECONNRESET or num == errno.ENOTSOCK) then
            return false, service, num
        end

        if ffi.os == "Windows" then
            return ip ~= "0.0.0.0" and ip2 ~= "0.0.0.0" and service ~= 0 and service2 ~= 0
        else
            return ip and ip2 and service ~= 0 and service2 ~= 0
        end
    end

    function meta:get_peer_name()
        local data = ffi.new("struct sockaddr_in")
        local len = ffi.new("unsigned int[1]", ffi.sizeof(data))

        local ok, err, num = socket.getpeername(self.fd, ffi.cast("struct sockaddr *", data), len)
        if not ok then return ok, err, num end

        return ffi.string(socket.inet_ntoa(data.sin_addr)), socket.ntohs(data.sin_port)
    end

    function meta:get_name()
        local data = ffi.new("struct sockaddr_in")
        local len = ffi.new("unsigned int[1]", ffi.sizeof(data))

        local ok, err, num = socket.getsockname(self.fd, ffi.cast("struct sockaddr *", data), len)
        if not ok then return ok, err, num end

        return ffi.string(socket.inet_ntoa(data.sin_addr)), socket.ntohs(data.sin_port)
    end

    local default_flags = 0

    if ffi.os ~= "Windows" then
        default_flags = e.MSG_NOSIGNAL
    end

    function meta:send_to(addr, data, flags)
        return self:send(data, flags, addr)
    end

    function meta:send(data, flags, addr)
        flags = flags or default_flags

        if self.on_send then
            return self:on_send(data, flags)
        end

        local len, err, num

        if addr then
            len, err, num = socket.sendto(self.fd, data, #data, flags, addr.addrinfo.ai_addr, addr.addrinfo.ai_addrlen)
        else
            len, err, num = socket.send(self.fd, data, #data, flags)
        end

        if not len then
            return len, err, num
        end

        if len > 0 then
            return len
        end
    end

    function meta:receive_from(address, size, flags)
        local src_addr
        local src_addr_size

        if not address then
            src_addr = ffi.new("struct sockaddr_in[1]")
            src_addr_size = ffi.sizeof("struct sockaddr_in")
        else
            src_addr = address.addrinfo.ai_addr
            src_addr_size = address.addrinfo.ai_addrlen
        end

        return self:receive(size, flags, src_addr, src_addr_size)
    end

    function meta:receive(size, flags, src_address, address_len)
        size = size or 64000
        local buff = ffi.new("char[?]", size)

        if self.on_receive then
            return self:on_receive(buff, size, flags)
        end

        local len, err, num
        local len_res

        if src_address then
            len_res = ffi.new("int[1]", address_len)
            len, err, num = socket.recvfrom(self.fd, buff, ffi.sizeof(buff), flags or 0, ffi.cast("struct sockaddr *", src_address), len_res)
        else
            len, err, num = socket.recv(self.fd, buff, ffi.sizeof(buff), flags or 0)
        end

        if num == errno.ECONNRESET then
            self:close()
            if self.debug then
                print(tostring(self), ": closed")
            end

            return nil, "closed", num
        end

        if not len then
            if not self.blocking and timeout_messages[num] then
                return nil, "timeout", num
            end

            if self.debug then
                print(tostring(self), " error", num, ":", err)
            end

            return len, err, num
        end

        if len > 0 then
            if self.debug then
                print(tostring(self), ": received ", len, " bytes")
            end

            if src_address then
                return ffi.string(buff, len), {
                    addrinfo = {
                        ai_addr = ffi.cast("struct sockaddr *", src_address),
                        ai_addrlen = len_res[0],
                    },
                    family = self.family,
                    get_port = addrinfo_get_port,
                    get_ip = addrinfo_get_ip,
                }
            end

            return ffi.string(buff, len)
        end

        return nil, err, num
    end
end

function M.bind(host, service)
    local info, err = M.find_first_address(host, service, {
        family = "inet",
        socket_type = "stream",
        protocol = "tcp",
        flags = {"passive"},
    })

    if not info then
        return info, err
    end

    local server, err, num = M.create(info.family, info.socket_type, info.protocol)

    if not server then
        return server, err, num
    end

    server:set_option("reuseaddr", 1)

    local ok, err, num = server:bind(info)

    if not ok then
        return ok, err, num
    end

    server:set_option("sndbuf", 65536)
    server:set_option("rcvbuf", 65536)

    return server
end

return M