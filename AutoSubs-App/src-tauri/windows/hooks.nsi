!macro Replace _source _search _replace _result
  Push ${_source}
  Push ${_search}
  Push ${_replace}
  Push ${_result}
  Call _Replace
!macroend

Function _Replace
  Exch $R9
  Exch
  Exch $R8
  Exch
  Exch $R7
  Exch
  Exch $R6
  Exch
  Push $R5
  Push $R4
  Push $R3
  Push $R2
  Push $R1
  StrCpy $R1 ""
  StrCpy $R2 0
loop:
  StrCpy $R3 $R6 "" $R2
  IfErrors done
  StrCpy $R4 $R3 1
  StrCmp $R4 $R7 0 +3
  StrCpy $R1 "$R1$R8"
  StrCpy $R2 $R2 + 1
  Goto loop
done:
  StrCpy $R3 $R6 "" $R2
  StrCpy $R1 "$R1$R3"
  Pop $R0
  Pop $R0
  Pop $R0
  Pop $R0
  Exch $R1
  Exch
  Exch $R9
  Exch
  Exch $R8
  Exch
  Exch $R7
  Exch
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  CopyFiles "$INSTDIR\resources\AutoSubs V2.lua" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"
  CopyFiles "$INSTDIR\resources\AutoSubs" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"
  CopyFiles "$INSTDIR\resources\modules\*.*" "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Modules\Lua"

  ; Write the installation path to a JSON file with forward slashes
  StrCpy $1 '{ "install_path": "'
  StrCpy $2 $INSTDIR
  ${Replace} $2 '\' '/' $2
  StrCpy $1 "$1$2"
  StrCpy $1 "$1\" }"
  FileOpen $0 "$APPDATA\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\AutoSubs\install_path.json" w
  FileWrite $0 $1
  FileClose $0
!macroend