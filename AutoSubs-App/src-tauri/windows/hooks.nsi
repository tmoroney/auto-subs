!macro NSIS_HOOK_POSTINSTALL
  CopyFiles "$INSTDIR\resources\AutoSubs.lua" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"
  CopyFiles "$INSTDIR\resources\AutoSubs.lua" "$PROGRAMDATA\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins"
  CopyFiles "$INSTDIR\resources\AutoSubs" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"

  ; Write the installation path to a simple text file
  FileOpen $0 "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs\install_path.txt" w
  FileWrite $0 $INSTDIR
  FileClose $0
!macroend