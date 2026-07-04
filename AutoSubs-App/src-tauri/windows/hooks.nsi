!macro NSIS_HOOK_POSTINSTALL
  ; J3: Clean up old v2 Resolve Scripts menu entries before installing v3.
  ; The v2 installer dropped several files/folders under Resolve's Fusion/Scripts
  ; directory that v3 no longer uses; without removing them, users see duplicate
  ; "AutoSubs" / "AutoSubs V2" entries in Resolve's Workspace > Scripts menu.
  ; All paths are in $APPDATA (per-user) since that's where v2 installed them.
  Delete "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs V2.lua"
  ; Old v2 modules folder + its install-path files (v3 bakes the path into AutoSubs.lua)
  Delete "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs\install_path.txt"
  Delete "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs\install_path.json"
  RMDir /r "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs"
  ; v2 also copied the script to the Workflow Integration Plugins folder under a V2 name
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

  ; Remove the old AutoSubs modules folder if a previous v3 install copied it
  ; (v3 now loads modules from the install dir via package.path, so the copy
  ; under Scripts\Utility is redundant and can cause stale-module issues).
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
