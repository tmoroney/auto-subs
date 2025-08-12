param([Parameter(Mandatory=$true)][string]$Path)

$ext = [IO.Path]::GetExtension($Path).ToLower()
if ($ext -in @('.exe', '.dll', '.msi')) {
  # Try the fixed path first; fall back to "versioned" SDK folders.
  $signtool = "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe"
  if (-not (Test-Path $signtool)) {
    $signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not (Test-Path $signtool)) {
    Write-Error "signtool.exe not found. Install Windows SDK or adjust path."
    exit 1
  }

  & $signtool sign `
    /tr http://time.certum.pl `
    /td sha256 `
    /fd sha256 `
    /sha1 df6635960a607103e4882c0671c2f8d0ef2ace18 `
    $Path
} else {
  Write-Host "Skipping non-signable file: $Path"
}
