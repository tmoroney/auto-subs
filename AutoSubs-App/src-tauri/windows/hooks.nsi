!macro NSIS_HOOK_POSTINSTALL
  CopyFiles "$INSTDIR\resources\AutoSubs V2.lua" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"
  CopyFiles "$INSTDIR\resources\modules" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Modules\Lua"
!macroend
