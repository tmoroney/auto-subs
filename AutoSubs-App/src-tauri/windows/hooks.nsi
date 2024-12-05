!macro NSIS_HOOK_POSTINSTALL
  CopyFiles "$INSTDIR\resources\AutoSubs V2.lua" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"
  CopyFiles "$INSTDIR\resources\AutoSubs" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"
  CopyFiles "$INSTDIR\resources\modules\*.*" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Modules\Lua"

  ; Write the installation path to a JSON file
  StrCpy $1 '{ "install_path": "'
  StrCpy $1 "$1$INSTDIR"
  StrCpy $1 '$1" }'
  FileOpen $0 "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs\install_path.json" w
  FileWrite $0 $1
  FileClose $0
!macroend