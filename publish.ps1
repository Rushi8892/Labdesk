$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\LabDesk.Api\LabDesk.Api.csproj"
$output = Join-Path $PSScriptRoot "publish\LabDesk"
$buildCache = Join-Path $PSScriptRoot ".cache\dotnet"

dotnet publish $project -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true -p:PublishTrimmed=false `
    --artifacts-path $buildCache -o $output
if ($LASTEXITCODE -ne 0) {
    throw "Publish failed with exit code $LASTEXITCODE."
}

Write-Host "Ready-to-copy folder: $output"
Write-Host "Set the connection string in that folder's appsettings.json before running."
