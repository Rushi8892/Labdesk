# Diagnostic Laboratory Management System

## .NET solution

- `LabDesk.sln` is the solution file at the repository root.
- `src/LabDesk.Api/` contains the ASP.NET Core API project.
- `src/LabDesk.Api/Data/` contains the ADO.NET repository and starter catalog.
- `src/LabDesk.Api/Models/` contains API and domain records.
- `src/LabDesk.Api/Services/` contains application validation and workflow logic.
- `database/` contains PostgreSQL and SQL Server setup scripts.

Build from the repository root:

```sh
dotnet build LabDesk.sln
```

Run the API with a configured database:

```sh
dotnet run --project src/LabDesk.Api/LabDesk.Api.csproj
```

The API uses ADO.NET repositories; it does not use Entity Framework.

For SQL Server, run `database/create-local-sqlserver.sql` in SQL Server Management Studio or Azure Data Studio, then set the connection and initialize the catalog from PowerShell:

```powershell
$env:DB_PROVIDER = "SqlServer"
$env:DB_CONNECTION_STRING = "Server=localhost;Database=PathologyTests;Trusted_Connection=True;TrustServerCertificate=True"
dotnet run --project src/LabDesk.Api/LabDesk.Api.csproj -- --initialize
```

For PostgreSQL, set `DB_PROVIDER=PostgreSql` and `DB_CONNECTION_STRING` (or the supported `DATABASE_URL` / `PG*` variables), then run:

```sh
dotnet run --project src/LabDesk.Api/LabDesk.Api.csproj -- --initialize
```

## Workspace preview

The React desktop interface is in `artifacts/labdesk/`. Replit's API artifact wrapper remains in `artifacts/api-server/` solely to run the .NET project in the workspace preview.
