$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$vbs = Join-Path $root 'GSLab.vbs'
$ico = Join-Path $root 'GSLab.ico'

if (-not (Test-Path $vbs)) {
    throw "GSLab.vbs was not found in $root. Run this script from the application folder."
}

$link = Join-Path ([Environment]::GetFolderPath('Desktop')) 'G.S. LAB.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = '"' + $vbs + '"'
$shortcut.WorkingDirectory = $root
$shortcut.Description = 'G.S. LAB'
if (Test-Path $ico) { $shortcut.IconLocation = "$ico,0" }
$shortcut.Save()

Write-Host "Desktop shortcut created: $link"
