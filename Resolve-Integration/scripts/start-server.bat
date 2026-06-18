@echo off
REM AutoSubs Server Launcher for Windows
REM Runs the development launcher "AutoSubs (Dev).lua" that
REM `npm run setup-resolve` writes into Resolve's Scripts\Utility folder.

REM Default paths - adjust these if your Resolve installation is different
set "SCRIPT_DIR=%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"
set "FUSCRIPT=C:\Program Files\Blackmagic Design\DaVinci Resolve\fuscript.exe"
set "DEV_SCRIPT=%SCRIPT_DIR%\AutoSubs (Dev).lua"

REM Allow override of script directory
if not "%~1"=="" (
    set "SCRIPT_DIR=%~1"
    set "DEV_SCRIPT=%~1\AutoSubs (Dev).lua"
)

echo Starting AutoSubs server...
echo Script directory: %SCRIPT_DIR%
echo Press Ctrl+C to stop the server
echo.

REM Start the server
"%FUSCRIPT%" "%DEV_SCRIPT%"

echo AutoSubs server has stopped.
