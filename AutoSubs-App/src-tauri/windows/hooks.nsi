!macro NSIS_HOOK_POSTINSTALL
  CopyFiles "$INSTDIR\resources\AutoSubs V2.lua" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"
  CopyFiles "$INSTDIR\resources\AutoSubs" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"
  CopyFiles "$INSTDIR\resources\modules\*.*" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Modules\Lua"

  ; Write the installation path to a JSON file
  FileOpen $0 "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs\install_path.json" w
  FileWrite $0 '{ "install_path": "' + $INSTDIR + '" }'
  FileClose $0
!macroend
