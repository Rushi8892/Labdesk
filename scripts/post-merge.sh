#!/bin/bash
set -e
# Replit maintenance only. Never change schema or reseed user data automatically.
dotnet restore LabDesk.sln --artifacts-path .cache/dotnet --nologo
