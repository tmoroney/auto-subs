@echo off
REM DaVinci Resolve Script Runner for Windows
REM Usage: run-script.bat <path_to_script.lua>

if "%~1"=="" (
    echo Usage: %0 ^<path_to_script.lua^>
    exit /b 1
)

set SCRIPT_PATH=%~1

REM Check if script file exists
if not exist "%SCRIPT_PATH%" (
    echo Error: Script file '%SCRIPT_PATH%' not found
    exit /b 1
)

REM Run the script with DaVinci Resolve's fuscript
"C:\Program Files\Blackmagic Design\DaVinci Resolve\fuscript.exe" "%SCRIPT_PATH%"
