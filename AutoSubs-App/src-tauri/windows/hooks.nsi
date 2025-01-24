!macro NSIS_HOOK_POSTINSTALL
  CopyFiles "$INSTDIR\resources\AutoSubs V2.lua" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"
  CopyFiles "$INSTDIR\resources\AutoSubs" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"

  ; Set the installation path as an environment variable
  WriteRegStr HKCU "Environment" "AUTOSUBS_INSTALL_PATH" "$INSTDIR"
  System::Call 'Kernel32::SendMessageTimeoutA(i 0xFFFF, i ${WM_SETTINGCHANGE}, i 0, t "Environment", i 0, i 5000, *i .r0)'
!macroend