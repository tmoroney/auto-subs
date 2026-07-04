!macro NSIS_HOOK_POSTINSTALL
  ; Remove old v2 entries to prevent duplicate Resolve Scripts menu items.
  Delete "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs V2.lua"
  Delete "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs\install_path.txt"
  Delete "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs\install_path.json"
  RMDir /r "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs"
  Delete "$PROGRAMDATA\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\AutoSubs V2.lua"

  ; Generate AutoSubs.lua with the installation path baked in (no file read needed at launch)
  FileOpen $0 "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs.lua" w
  FileWrite $0 "local app_executable = [["
  FileWrite $0 $INSTDIR
  FileWrite $0 "\AutoSubs.exe]]$\r$\n"
  FileWrite $0 "local resources_folder = [["
  FileWrite $0 $INSTDIR
  FileWrite $0 "\resources]]$\r$\n"
  FileWrite $0 "local modules_path = resources_folder .. $\"\\modules$\"$\r$\n"
  FileWrite $0 "package.path = package.path .. $\";$\" .. modules_path .. $\"\\?.lua$\"$\r$\n"
  FileWrite $0 "local AutoSubs = require($\"autosubs_core$\")$\r$\n"
  FileWrite $0 "AutoSubs:Init(app_executable, resources_folder, false)$\r$\n"
  FileClose $0

  ; Remove redundant v3 modules copy (now loaded from install dir via package.path).
  RMDir /r "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs"

  ; Remove install_path.txt written by older versions
  Delete "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs\install_path.txt"

  ; Ensure Workflow Integration Plugins directory exists (do last just in case it fails)
  CreateDirectory "$PROGRAMDATA\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins"
  CopyFiles "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs.lua" "$PROGRAMDATA\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins"

  ; Adobe Extension Installation
  CreateDirectory "$APPDATA\Adobe\CEP\extensions"
  CopyFiles "$INSTDIR\resources\com.autosubs.adobe" "$APPDATA\Adobe\CEP\extensions"

  ; Enable PlayerDebugMode for Adobe CEP extensions (CSXS 6-14)
  ; CSXS.13/14 are required for Premiere Pro 2026 (v26); older keys cover legacy versions.
  WriteRegStr HKCU "Software\Adobe\CSXS.6" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.7" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.8" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.9" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.10" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.11" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.12" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.13" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.14" "PlayerDebugMode" "1"
!macroend
