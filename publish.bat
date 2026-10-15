@echo off
setlocal
pushd "%~dp0"
dotnet publish "src\LabDesk.Api\LabDesk.Api.csproj" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true -p:PublishTrimmed=false --artifacts-path "%~dp0.cache\dotnet" -o "%~dp0publish\LabDesk"
if errorlevel 1 (
    popd
    echo Publish failed. Check the errors above.
    exit /b 1
)
popd
echo.
echo Ready-to-copy folder: %~dp0publish\LabDesk
echo Set the connection string in that folder's appsettings.json before running.
exit /b 0
