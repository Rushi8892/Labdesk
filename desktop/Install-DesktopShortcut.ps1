$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$exe = Join-Path $root 'GSLab.exe'

if (-not (Test-Path $exe)) {
    throw "GSLab.exe was not found in $root. Run this script from the application folder."
}

$link = Join-Path ([Environment]::GetFolderPath('Desktop')) 'G.S. LAB.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = $exe
$shortcut.WorkingDirectory = $root
$shortcut.Description = 'G.S. LAB'
$shortcut.IconLocation = "$exe,0"
$shortcut.Save()

Write-Host "Desktop shortcut created: $link"
