@echo off

REM Check if the file extension is .exe
IF /I "%~x1"==".exe" (
    echo "Signing executable: %~1"
    REM Add your signtool command here. Make sure the path to signtool.exe is correct for your system.
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22000.0\x64\signtool.exe" sign /fd SHA256 /a /sha1 df6635960a607103e4882c0671c2f8d0ef2ace18 /t http://time.certum.pl "%~1"
) ELSE (
    echo "Skipping non-executable: %~1"
)

REM Exit with success code so the Tauri build can continue
exit /b 0