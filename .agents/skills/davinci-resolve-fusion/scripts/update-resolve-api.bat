@echo off
rem Sync the DaVinci Resolve scripting API reference into references\resolve-api.txt.
rem Run after a DaVinci Resolve update. Override source with RESOLVE_SCRIPT_API env var.
setlocal
set "HERE=%~dp0"
set "DEST=%HERE%..\references\resolve-api.txt"

set "SRC=%RESOLVE_SCRIPT_API%\README.txt"
if not exist "%SRC%" set "SRC=%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\README.txt"
if not exist "%SRC%" set "SRC=%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\README.txt"
if not exist "%SRC%" (
  echo ERROR: Could not find Resolve's README.txt. 1>&2
  echo Set RESOLVE_SCRIPT_API to your Resolve "Developer\Scripting" folder and retry. 1>&2
  exit /b 1
)

> "%DEST%" (
  echo # ============================================================================
  echo # DaVinci Resolve Scripting API Reference  -  SOURCE OF TRUTH
  echo #
  echo # Plain text on purpose ^(monospace column-aligned; unreadable as Markdown^).
  echo # Synced from: %SRC%
  echo # Re-sync after a Resolve update: scripts\update-resolve-api.bat
  echo # ============================================================================
  echo.
  type "%SRC%"
)
echo Updated "%DEST%"
echo   from "%SRC%"
