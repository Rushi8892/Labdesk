$ErrorActionPreference = "Stop"
$api = Join-Path $PSScriptRoot "src\LabDesk.Api\LabDesk.Api.csproj"
$desktop = Join-Path $PSScriptRoot "src\LabDesk.Desktop\LabDesk.Desktop.csproj"
$output = Join-Path $PSScriptRoot "publish\LabDesk"
$buildCache = Join-Path $PSScriptRoot ".cache\dotnet"

$common = @(
    "-c", "Release", "-r", "win-x64", "--self-contained", "true",
    "-p:PublishSingleFile=true", "-p:IncludeNativeLibrariesForSelfExtract=true",
    "-p:EnableCompressionInSingleFile=true", "-p:PublishTrimmed=false",
    "--artifacts-path", $buildCache, "-o", $output
)

# The server first: it also lays down appsettings.json, wwwroot and database.
dotnet publish $api @common
if ($LASTEXITCODE -ne 0) {
    throw "API publish failed with exit code $LASTEXITCODE."
}

# The desktop window, published beside the server it starts.
dotnet publish $desktop @common
if ($LASTEXITCODE -ne 0) {
    throw "Desktop publish failed with exit code $LASTEXITCODE."
}

Write-Host "Ready-to-copy folder: $output"
Write-Host "Set the connection string in that folder's appsettings.json before running."
