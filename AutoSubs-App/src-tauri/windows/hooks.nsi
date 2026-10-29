!macro NSIS_HOOK_PREINSTALL
  ; Stop the Open from Resolve watcher (resolve_launcher.rs) before the
  ; "AutoSubs is running" check, which would otherwise ask the user to close an
  ; app they never see. Versions without the flag just exit.
  IfFileExists "$INSTDIR\AutoSubs.exe" 0 +2
    ExecWait '"$INSTDIR\AutoSubs.exe" --stop-resolve-watcher' $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  IfFileExists "$INSTDIR\AutoSubs.exe" 0 +2
    ExecWait '"$INSTDIR\AutoSubs.exe" --stop-resolve-watcher' $0
  ; Updates run the old uninstaller with /UPDATE; keep the login entry then,
  ; the new version's postinstall rewrites it.
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "AutoSubs"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Remove old v2 entries to prevent duplicate Resolve Scripts menu items.
  Delete "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs V2.lua"
  Delete "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs\install_path.txt"
  Delete "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs\install_path.json"
  RMDir /r "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs"
  Delete "$PROGRAMDATA\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\AutoSubs V2.lua"

  ; Write the Resolve bridge launcher now so it exists before the app first
  ; runs (a headless flag reuses the app's own install path, including
  ; ANSI/8.3 path handling). The same path deletes the AutoSubs.scriptlib that
  ; 3.10.0 installed. The app also does both on startup (resolve_scripts.rs),
  ; so a failure here is recoverable — don't check $0. It also adds and starts
  ; the Open from Resolve watcher, so the script opens the app right away.
  ExecWait '"$INSTDIR\AutoSubs.exe" --install-resolve-scripts' $0

  ; Remove redundant v3 modules copy (now loaded from install dir via package.path).
  RMDir /r "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs"

  ; Remove install_path.txt written by older versions
  Delete "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs\install_path.txt"

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
