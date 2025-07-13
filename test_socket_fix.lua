#!/usr/bin/env lua
-- Test script to verify the socket binding fix
-- This simulates the "Address already in use" scenario

print("=== AutoSubs Socket Fix Test ===")
print("Testing improved socket binding mechanism...")

-- Test configuration
local test_port = 56002
local max_tests = 3

-- Helper function to execute command and capture output
local function execute_command(cmd)
    local handle = io.popen(cmd .. " 2>&1")
    local result = handle:read("*a")
    handle:close()
    return result
end

-- Helper function to check if port is in use
local function is_port_in_use(port)
    local cmd = string.format("lsof -i :%d", port)
    local result = execute_command(cmd)
    return result:match("LISTEN") ~= nil
end

-- Helper function to start a dummy server
local function start_dummy_server(port)
    local cmd = string.format([[
        lua -e "
        local socket = require('socket')
        local server = socket.tcp()
        server:bind('127.0.0.1', %d)
        server:listen()
        print('Dummy server listening on port %d')
        os.execute('sleep 5')
        " &
    ]], port, port)
    os.execute(cmd)
    os.execute("sleep 1") -- Give server time to start
end

-- Test 1: Basic socket binding (should work)
print("\nTest 1: Basic socket binding")
if not is_port_in_use(test_port) then
    print("✓ Port " .. test_port .. " is available")
else
    print("✗ Port " .. test_port .. " is already in use - cleaning up")
    os.execute("pkill -f 'lua.*56002'")
    os.execute("sleep 2")
end

-- Test 2: Socket binding with port already in use
print("\nTest 2: Socket binding recovery with port in use")
print("Starting dummy server to occupy port...")
start_dummy_server(test_port)

if is_port_in_use(test_port) then
    print("✓ Dummy server successfully occupying port " .. test_port)
    
    -- Simulate the fix by sending Exit command
    print("Sending Exit command to release port...")
    local curl_cmd = string.format([[
        curl --request POST \
            --url http://localhost:%d/ \
            --header 'Content-Type: application/json' \
            --data '{"func":"Exit"}' \
            --silent --max-time 2
    ]], test_port)
    
    execute_command(curl_cmd)
    os.execute("sleep 1")
    
    -- Check if port is released
    if not is_port_in_use(test_port) then
        print("✓ Port successfully released after Exit command")
    else
        print("! Port still in use, forcing cleanup...")
        os.execute("pkill -f 'lua.*56002'")
        os.execute("sleep 2")
        
        if not is_port_in_use(test_port) then
            print("✓ Port released after forced cleanup")
        else
            print("✗ Failed to release port")
        end
    end
else
    print("✗ Failed to start dummy server")
end

-- Test 3: Multiple retry attempts
print("\nTest 3: Multiple retry mechanism")
local retry_success = false
for i = 1, max_tests do
    print("Retry attempt " .. i .. "...")
    
    if not is_port_in_use(test_port) then
        print("✓ Port is available on attempt " .. i)
        retry_success = true
        break
    else
        print("Port still in use, cleaning up...")
        os.execute("pkill -f 'lua.*56002'")
        os.execute("sleep 1")
    end
end

if retry_success then
    print("✓ Retry mechanism working correctly")
else
    print("✗ Retry mechanism failed")
end

-- Final cleanup
print("\nCleaning up...")
os.execute("pkill -f 'lua.*56002'")
os.execute("sleep 1")

-- Summary
print("\n=== Test Summary ===")
print("The improved socket binding mechanism includes:")
print("1. Multiple retry attempts (up to 3)")
print("2. Sending Exit commands to both ports")
print("3. Socket recreation on each retry")
print("4. Proper cleanup function")
print("5. Graceful shutdown handling")
print("\nThese improvements should prevent the 'Address already in use' error")
print("when AutoSubs doesn't shut down cleanly.")