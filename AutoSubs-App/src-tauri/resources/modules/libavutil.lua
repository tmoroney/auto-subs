--[[

MIT License

Copyright (c) 2023 Roger Magnusson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

-----------------------------------------------------------------------------


	DaVinci Resolve comes with binaries for libavcodec, libavformat and libavutil.

	This script is an example of how we can take advantage of having those libraries available to
	LuaJIT. Specifically we'll use av_timecode_make_string() and av_timecode_init_from_string() to
	create and parse timecode.

	roger.magnusson@gmail.com


]]

local luaresolve, libavutil

luaresolve = 
{
	frame_rates =
	{
		get_fraction = function(self, frame_rate_string_or_number)
			local frame_rate = tonumber(tostring(frame_rate_string_or_number))
			-- These are the frame rates that DaVinci Resolve Studio supports as of version 18
			local frame_rates = { 16, 18, 23.976, 24, 25, 29.97, 30, 47.952, 48, 50, 59.94, 60, 72, 95.904, 96, 100, 119.88, 120 }

			for _, current_frame_rate in ipairs (frame_rates) do
				if current_frame_rate == frame_rate or math.floor(current_frame_rate) == frame_rate then
					local is_decimal = current_frame_rate % 1 > 0
					local denominator = iif(is_decimal, 1001, 100)
					local numerator = math.ceil(current_frame_rate) * iif(is_decimal, 1000, denominator)
					return { num = numerator, den = denominator }
				end
			end

			return nil, string.format("Invalid frame rate: %s", frame_rate_string_or_number)
		end,

		get_decimal = function(self, frame_rate_string_or_number)
			local fractional_frame_rate, error_message = self:get_fraction(frame_rate_string_or_number)
			
			if fractional_frame_rate ~= nil then
				return tonumber(string.format("%.3f", fractional_frame_rate.num / fractional_frame_rate.den))
			else
				return nil, error_message
			end
		end,
	},

	load_library = function(name_pattern)
		local files = bmd.readdir(fu:MapPath("FusionLibs:"..iif(ffi.os == "Windows", "", "../"))..name_pattern)
		assert(#files == 1 and files[1].IsDir == false, string.format("Couldn't find exact match for pattern \"%s.\"", name_pattern))
		return ffi.load(files.Parent..files[1].Name)
	end,

	frame_from_timecode = function(self, timecode, frame_rate)
		return libavutil:av_timecode_init_from_string(timecode, self.frame_rates:get_fraction(frame_rate)).start
	end,

	timecode_from_frame = function(self, frame, frame_rate, drop_frame)
		return libavutil:av_timecode_make_string(0, frame, self.frame_rates:get_decimal(frame_rate),
		{
			AV_TIMECODE_FLAG_DROPFRAME = drop_frame == true or drop_frame == 1 or drop_frame == "1",
			AV_TIMECODE_FLAG_24HOURSMAX = true,
			AV_TIMECODE_FLAG_ALLOWNEGATIVE = false
		})
	end,

	-- Convenience: detect common NTSC fractional rates where drop-frame is appropriate
	is_ntsc_fractional = function(self, frame_rate)
		local f = tonumber(tostring(frame_rate)) or 0
		local function approx(a,b) return math.abs(a-b) < 0.01 end
		return approx(f, 29.97) or approx(f, 59.94) or approx(f, 119.88)
	end,

	-- Frames -> Timecode with automatic drop-frame selection
	timecode_from_frame_auto = function(self, frame, frame_rate)
		local use_df = self:is_ntsc_fractional(frame_rate)
		return self:timecode_from_frame(frame, frame_rate, use_df)
	end,

    test_timecode = function()
        print(luaresolve:frame_from_timecode("01:00:00;00", 29.97))
        print(luaresolve:frame_from_timecode("01:00:00:00", 25))
        print(luaresolve:timecode_from_frame(107892, 29.97, true))
        print(luaresolve:timecode_from_frame(90000, 25))
    end,
}

libavutil = 
{
	library = luaresolve.load_library(iif(ffi.os == "Windows", "avutil*.dll", iif(ffi.os == "OSX", "libavutil*.dylib", "libavutil.so"))),

	demand_version = function(self, version)
		local library_version = self:av_version_info()

		return (library_version.major > version.major)
			or (library_version.major == version.major and library_version.minor > version.minor)
			or (library_version.major == version.major and library_version.minor == version.minor and library_version.patch > version.patch)
			or (library_version.major == version.major and library_version.minor == version.minor and library_version.patch == version.patch)
	end,

	set_declarations = function()
		ffi.cdef[[
			enum AVTimecodeFlag {
				AV_TIMECODE_FLAG_DROPFRAME      = 1<<0, // timecode is drop frame
				AV_TIMECODE_FLAG_24HOURSMAX     = 1<<1, // timecode wraps after 24 hours
				AV_TIMECODE_FLAG_ALLOWNEGATIVE  = 1<<2, // negative time values are allowed
			};

			struct AVRational { int32_t num; int32_t den; };
			struct AVTimecode { int32_t start; enum AVTimecodeFlag flags; struct AVRational rate; uint32_t fps; };

			char* av_timecode_make_string(const struct AVTimecode* tc, const char* buf, int32_t framenum);
			int32_t av_timecode_init_from_string(struct AVTimecode* tc, struct AVRational rate, const char* str, void* log_ctx);

			char* av_version_info (void);
		]]
	end,

	av_timecode_make_string = function(self, start, frame, fps, flags)
		local function bor_number_flags(enum_name, flags)
			local enum_value = 0    
	
			if (flags) then
				for key, value in pairs(flags) do
					if (value == true) then
						enum_value = bit.bor(enum_value, tonumber(ffi.new(enum_name, key)))
					end
				end
			end

			return enum_value;
		end

		local tc = ffi.new("struct AVTimecode",
		{
			start = start,
			flags = bor_number_flags("enum AVTimecodeFlag", flags),
			fps = math.ceil(luaresolve.frame_rates:get_decimal(fps))
		})

		if (flags.AV_TIMECODE_FLAG_DROPFRAME and fps > 60 and (fps % (30000 / 1001) == 0 or fps % 29.97 == 0))
			and (not self:demand_version( { major = 4, minor = 4, patch = 0 } ))
		then
			-- Adjust for drop frame above 60 fps (not necessary if BMD upgrades to libavutil-57 or later)
			frame = frame + 9 * tc.fps / 15 * (math.floor(frame / (tc.fps * 599.4))) + (math.floor((frame % (tc.fps * 599.4)) / (tc.fps * 59.94))) * tc.fps / 15
		end

		local timecodestring = ffi.string(self.library.av_timecode_make_string(tc, ffi.string(string.rep(" ", 16)), frame))
	
		if (#timecodestring > 0) then
			local frame_digits = #tostring(math.ceil(fps) - 1)

			-- Fix for libavutil where it doesn't use leading zeros for timecode at frame rates above 100
			if frame_digits > 2 then
				timecodestring = string.format("%s%0"..frame_digits.."d", timecodestring:sub(1, timecodestring:find("[:;]%d+$")), tonumber(timecodestring:match("%d+$")))
			end

			return timecodestring
		else
			return nil
		end
	end,

	av_timecode_init_from_string = function(self, timecode, frame_rate_fraction)
		local tc = ffi.new("struct AVTimecode")
		local result = self.library.av_timecode_init_from_string(tc, ffi.new("struct AVRational", frame_rate_fraction), timecode, ffi.new("void*", nil))
	
		if (result == 0) then
			return
			{
				start = tc.start,
				flags =
				{
					AV_TIMECODE_FLAG_DROPFRAME = bit.band(tc.flags, ffi.C.AV_TIMECODE_FLAG_DROPFRAME) == ffi.C.AV_TIMECODE_FLAG_DROPFRAME,
					AV_TIMECODE_FLAG_24HOURSMAX = bit.band(tc.flags, ffi.C.AV_TIMECODE_FLAG_24HOURSMAX) == ffi.C.AV_TIMECODE_FLAG_24HOURSMAX,
					AV_TIMECODE_FLAG_ALLOWNEGATIVE = bit.band(tc.flags, ffi.C.AV_TIMECODE_FLAG_ALLOWNEGATIVE) == ffi.C.AV_TIMECODE_FLAG_ALLOWNEGATIVE,
				},
				rate =
				{
					num = tc.rate.num,
					den = tc.rate.den
				},
				fps = tc.fps
			}
		else
			error("avutil error code: "..result)
		end
	end,

	av_version_info = function(self)
		local version = ffi.string(self.library.av_version_info())

		return 
		{
			major = tonumber(version:match("^%d+")),
			minor = tonumber(version:match("%.%d+"):sub(2)),
			patch = tonumber(version:match("%d+$"))
		}
	end,
}

libavutil.set_declarations()

--[[
	Usage:

	luaresolve:frame_from_timecode(string Timecode, number FrameRate)

	luaresolve:timecode_from_frame(number Frame, number FrameRate [, boolean DropFrame])
]]

return luaresolve