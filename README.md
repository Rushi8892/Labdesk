# LabDesk

A desktop-style diagnostic laboratory application built with ASP.NET Core and
plain HTML, CSS and vanilla JavaScript. The same .NET process serves the UI and
the `/api` endpoints on one port. Static files need no compilation.

Data access uses **ADO.NET**, parameterized queries and a repository layer.
Microsoft SQL Server is the final/local database. PostgreSQL is supported only
as the temporary development database. There is no Entity Framework.

## Run locally on Windows

Run the following commands in PowerShell from the repository root.

### 1. Prerequisites

- **.NET 10 SDK** to build, run from source, or publish.
- **SQL Server 2016 or later**, SQL Server Express, or **LocalDB**.
- A way to execute SQL scripts, such as SQL Server Management Studio or the
  optional `sqlcmd` utility.

The target computer does **not** need .NET installed when using the
self-contained published executable. It still needs access to SQL Server;
publishing does not bundle a database server or copy your database.

### 2. Create the database, schema and starter catalog

Connect to SQL Server in Management Studio. Create an empty database named
`PathologyTests` if it does not already exist:

```sql
IF DB_ID(N'PathologyTests') IS NULL
    CREATE DATABASE [PathologyTests];
```

Select `PathologyTests` in SSMS, then open and execute these two files in order:

1. `database/schema.sql` creates the two generic repository tables and indexes.
   It uses existence checks, so it can be run again without dropping data.
2. `database/seed.sql` inserts the starter categories, specimen types, tests
   and parameters, including audit entries. It runs only when the database has
   no tests; rerunning it won't overwrite a lab's catalog.

There are two physical tables by design: `lab_entity` stores every configurable
entity, parameter, result and snapshot; `lab_audit` stores the audit trail.
Categories and test types do not each get a separate database table.

For LocalDB, the instance name is `(localdb)\MSSQLLocalDB`. If `sqlcmd` is
installed, the equivalent commands are:

```powershell
sqlcmd -S "(localdb)\MSSQLLocalDB" -E -b -Q "IF DB_ID(N'PathologyTests') IS NULL CREATE DATABASE [PathologyTests];"
sqlcmd -S "(localdb)\MSSQLLocalDB" -d "PathologyTests" -E -b -i ".\database\schema.sql"
sqlcmd -S "(localdb)\MSSQLLocalDB" -d "PathologyTests" -E -b -i ".\database\seed.sql"
```

For SQL Server Express, use your instance name instead, for example
`.\SQLEXPRESS`. The account creating the database needs permission to do so.
If you use a different database name, create it and execute both files with that
database selected.

Alternatively, after creating the database and configuring the connection
string, the application's `--initialize` command applies `schema.sql` and
`seed.sql` automatically. Both files are safe to apply again.

### 3. Configure the connection

Settings live in `src/LabDesk.Api/`:

| File | Purpose |
| --- | --- |
| `appsettings.json` | Shared defaults; SQL Server and clearly marked example/placeholder connection strings |
| `appsettings.Development.json` | Development overrides, including a LocalDB example |
| `appsettings.Local.json` | Optional personal overrides; ignored by source control and excluded from publishing |

Create `src/LabDesk.Api/appsettings.Local.json` for your machine:

```json
{
  "Database": {
    "Provider": "SqlServer"
  },
  "ConnectionStrings": {
    "SqlServer": "Server=(localdb)\\MSSQLLocalDB;Database=PathologyTests;Integrated Security=True;TrustServerCertificate=True;"
  },
  "Server": {
    "Url": "http://localhost:5000"
  },
  "Browser": {
    "OpenOnStart": true
  }
}
```

Replace the server with your instance if you are not using LocalDB. For example,
use `Server=.\\SQLEXPRESS` in JSON for SQL Server Express. Windows authentication
uses the identity running the application. `TrustServerCertificate=True` is a
local-development convenience; use a trusted SQL Server certificate for remote
operational setups. Never commit real credentials.

Configuration loads in this order, with later settings taking precedence:

1. `appsettings.json`
2. `appsettings.{Environment}.json`
3. Optional `appsettings.Local.json`
4. Environment variables

Compatibility overrides remain supported:

- `DB_PROVIDER` explicitly selects `SqlServer` or `PostgreSql`.
- `DB_CONNECTION_STRING` overrides the selected provider's connection string.
- `DATABASE_URL`, or `PGHOST` / `PGPORT` / `PGDATABASE` / `PGUSER` / `PGPASSWORD`,
  configure PostgreSQL. Without an explicit `DB_PROVIDER`, `DATABASE_URL` or
  `PGHOST` selects PostgreSQL so the temporary development environment still works.
- `PORT` overrides the listening port and binds to all interfaces.
- Otherwise `ASPNETCORE_URLS` overrides `Server:Url`.
- Standard nested settings also support double-underscore environment names,
  such as `Browser__OpenOnStart=false`.

SQL Server is the default when no PostgreSQL environment variables are present.
Restart the application after changing configuration.

### 4. Initialize and seed

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet restore LabDesk.sln
dotnet run --project .\src\LabDesk.Api\LabDesk.Api.csproj -- --initialize
```

The initializer creates missing schema objects in the **configured, existing
database**, then seeds the existing starter catalog if there are no tests.
It does not overwrite an existing catalog, clear results, or reset lab settings.
The SQL Server schema and seed files can also be run directly in SSMS.

The catalog remains laboratory-editable. Medical reference intervals must be
entered and approved by the laboratory; the application must not invent them.

### 5. Start the application

```powershell
dotnet run --project .\src\LabDesk.Api\LabDesk.Api.csproj
```

Open **http://localhost:5000**. On Windows, the default browser opens
automatically unless `Browser:OpenOnStart` is false. Stop the app with `Ctrl+C`.

- UI: `http://localhost:5000/`
- API: `http://localhost:5000/api/...`
- Health check: `http://localhost:5000/api/healthz`

The JavaScript uses relative `/api` URLs. There is no separate frontend server,
proxy, or cross-origin configuration. If you change `Server:Url`, UI and API
move together.

## Publish a Windows x64 executable

From the repository root, use **either**:

```powershell
.\publish.bat
```

or:

```powershell
powershell -ExecutionPolicy Bypass -File .\publish.ps1
```

Both run `dotnet publish` for `win-x64`, self-contained and single-file, without
trimming. Native dependencies are included in the executable and extracted by
the runtime when needed. Publishing requires internet access to restore the
Windows runtime packages.

The ready-to-copy output is **`publish/LabDesk/`**:

```text
LabDesk/
├── LabDesk.Api.exe       # Application + .NET runtime
├── appsettings.json     # Editable settings beside the executable
├── appsettings.Development.json
├── wwwroot/             # HTML, CSS, JavaScript and page files
└── database/            # Schema scripts used by --initialize
```

Other SDK-generated metadata or symbols may also be present. Copy the **whole
folder**, not just the executable: its settings and static UI files are external
on purpose. `appsettings.Local.json` is not copied by the publish scripts.
The `publish/` output is ignored by source control.

## Run the published folder on another machine

1. Copy `publish/LabDesk/` to a writable folder on a supported **Windows x64**
   machine or server.
2. Ensure SQL Server is installed or reachable, and create the database if it
   does not already exist. The shipped `database/schema.sql` and
   `database/seed.sql` initialize its tables and starter catalog.
3. Edit **the published folder's `appsettings.json`**. Replace `YOUR_SQL_SERVER`
   and set the correct database/authentication settings. Personal source
   settings are deliberately not published.
4. On an empty database, run `.\LabDesk.Api.exe --initialize` once from PowerShell.
5. Run `.\LabDesk.Api.exe`, or double-click it. The UI opens in the default browser.
   Keep its console process running while using the application.

No SDK or separately installed .NET runtime is required on the target machine.
Database data is managed separately; use SQL Server's backup/restore facilities
if you need to move it. A Windows executable is not a cross-platform executable;
another operating system or CPU architecture requires a matching publish target.

For server use, set `Browser:OpenOnStart` to false. If remote browser access is
intended, configure an appropriate listening address and firewall/reverse proxy.
The existing single-laboratory workbench does not provide authenticated accounts
or authorization; do not expose it publicly or use real patient data without
the required security controls and laboratory validation.

## Temporary PostgreSQL development environment

The same repository layer supports `Database:Provider = PostgreSql` and
`ConnectionStrings:PostgreSql`, as well as the environment overrides above.
Connect to an existing database and run the same `--initialize` command. The
temporary PostgreSQL schema is initialized by the repository, then the existing
C# starter-catalog seeder runs. The two distributed SQL files are for SQL Server.

The managed Replit workflow starts the .NET project directly and supplies the
listening port. Its PostgreSQL environment variables take precedence over the
local SQL Server examples. No hosted data is required for the code handoff.

## Behavior and maintenance

- One configurable engine handles every test category.
- Test and parameter codes remain scoped and unique as before.
- Results have only **Draft** and **Completed** states. Completion locks the
  result and stores its report snapshot in the same operation.
- No patient codes, result contexts, result comments, or per-parameter status
  fields are used in result entry.
- Reference selection uses age and sex, with the existing general fallback.
- Completed reports read their stored values, labels, units, ranges and flags;
  later catalog edits do not alter them.
- Reference approval is separate from results. Results need no verification
  or release step.
- Configuration is deactivated rather than hard-deleted. Important changes
  remain audited.

Build the solution with `dotnet build LabDesk.sln`. Rebuild/restart after editing
static files when running from source; the project copies them into its output.
`docs/openapi.yaml` documents the unchanged API contract.

## Troubleshooting

| Problem | Check |
| --- | --- |
| `net10.0` is not supported | Install the .NET 10 **SDK**, not only a runtime. Check `dotnet --version`. |
| Database login/connection fails | Check the instance is running, the database exists, and the connection string uses the correct Windows identity or login. |
| The wrong database provider is selected | Check `DB_PROVIDER`, `DATABASE_URL` and `PG*` environment variables; they override file settings. |
| `lab_entity` or `lab_audit` does not exist | Run the create-database script, then `--initialize` against the same configured database. |
| The port is already in use | Stop the other process or change `Server:Url`; check for a `PORT` override. |
| UI is missing in a copied folder | Copy all of `wwwroot/` with the executable. Do not move only the `.exe`. |
| The browser does not open | Open the configured URL manually. Browser launch is Windows-only and can be disabled for servers. |
| Native extraction/access error | Ensure the running account can write to its temporary directory; self-contained native libraries may be extracted there. |
| Health works but catalog does not | The health endpoint checks the HTTP process, not database connectivity. Check initialization and database settings. |
| A reference is not shown | Check active/approved status, age/sex applicability, effective dates and matching units. Do not invent a replacement range. |

## Folder structure

```text
LabDesk.sln
README.md
replit.md
publish.bat
publish.ps1
database/
├── schema.sql                 # Idempotent SQL Server tables and indexes
└── seed.sql                   # Idempotent SQL Server starter catalog
docs/
└── openapi.yaml               # API documentation
scripts/
└── post-merge.sh              # Replit dependency restoration only
src/
└── LabDesk.Api/
    ├── LabDesk.Api.csproj
    ├── Program.cs
    ├── appsettings.json
    ├── appsettings.Development.json
    ├── appsettings.Local.json # Optional, untracked personal settings
    ├── Data/                 # ADO.NET repository and temporary PostgreSQL seeder
    ├── Models/               # Request, response and domain records
    ├── Services/             # Validation, reference evaluation and snapshots
    └── wwwroot/
        ├── index.html
        ├── css/
        ├── js/
        └── pages/
```

Build/intermediate output (`bin/`, `obj/`), caches, personal settings and
published output are generated locally and excluded from source control.
