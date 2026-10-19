# LabDesk

A desktop-style diagnostic laboratory application built with ASP.NET Core and
plain HTML, CSS and vanilla JavaScript. The same .NET process serves the UI and
the `/api` endpoints on one port. Static files need no compilation.

Data access uses **ADO.NET**, parameterized queries, one repository per concept
and a service layer that holds the rules. Microsoft SQL Server is the database.
There is no Entity Framework.

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

1. `database/schema.sql` creates the tables and indexes. It uses existence
   checks, so it can be run again without dropping data.
2. `database/seed.sql` inserts the starter categories, specimen types, tests
   and parameters, including audit entries. It runs only when the catalog has
   no tests; rerunning it won't overwrite a lab's catalog.

Storage is one table per concept, with the relationships enforced by the
database itself:

| Table | Holds |
| --- | --- |
| `category`, `specimen`, `method` | the configurable masters |
| `test` | the tests |
| `test_parameter` | a test's parameters, including the reference lines a report prints |
| `parameter_option` | the dropdown options a parameter allows |
| `doctor`, `patient` | who the sample belongs to and who referred it |
| `lab_result`, `result_value` | drafts and completed results |
| `report_snapshot`, `report_line` | the frozen copy a completed report prints |
| `lab_audit` | the audit trail |

`schema.sql` no longer creates `lab_entity`, the older single-table JSON storage;
nothing reads it. A database created by an earlier version still holds it, and
`database/drop-legacy.sql` removes it. That script destroys whatever results and
reports were still held there, so it refuses to run unless it is passed
`-v ConfirmDrop=YES`.

For LocalDB, the instance name is `(localdb)\MSSQLLocalDB`. If `sqlcmd` is
installed, the equivalent commands are:

```powershell
sqlcmd -S "(localdb)\MSSQLLocalDB" -E -b -Q "IF DB_ID(N'PathologyTests') IS NULL CREATE DATABASE [PathologyTests];"
sqlcmd -S "(localdb)\MSSQLLocalDB" -d "PathologyTests" -E -b -I -i ".\database\schema.sql"
sqlcmd -S "(localdb)\MSSQLLocalDB" -d "PathologyTests" -E -b -I -i ".\database\seed.sql"
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

Environment overrides remain supported:

- `DB_CONNECTION_STRING` overrides the connection string.
- `PORT` overrides the listening port and binds to all interfaces.
- Otherwise `ASPNETCORE_URLS` overrides `Server:Url`.
- Standard nested settings also support double-underscore environment names,
  such as `Browser__OpenOnStart=false`.

Restart the application after changing configuration.

### The laboratory letterhead

The report header is read from the `Lab` section, so it can be overridden in any
settings file:

```json
"Lab": {
  "Name": "City Diagnostics",
  "Address": "12 Station Road, Pune",
  "Phone1": "+91 00000 00000",
  "Phone2": "+91 00000 00000",
  "Logo": "logo.png"
}
```

`Lab:Logo` names a file inside `wwwroot`, so a new logo is a new image file
copied into `wwwroot` plus this one setting. The default points at the mark that
already ships with the application. The API serves this section as `GET /api/lab`.
It is read at print time, so a report reprinted after a change shows the current
letterhead, while the patient, the referring doctor, the references and the dates
were frozen into the report when it was completed.

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

The catalog remains laboratory-editable. Each parameter carries its own reference
lines, which the laboratory enters; the application must not invent one.

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

## Behavior and maintenance

- One configurable engine handles every test category.
- Codes are unique in their scope: a test code across tests, a parameter code
  within its test, an option code within its parameter.
- A patient is recorded first, with an optional referring doctor. A result then
  points at that patient and at a test.
- A parameter prints one or more reference lines, held in `normal_ranges` as a
  JSON array of strings, so sex or age bands are simply extra lines
  (`["Male: 65-176 ug/dL", "Female: 26-170 ug/dL"]`). Nothing compares a result
  against them, so no result carries a flag.
- Results have only **Draft** and **Completed** states. Completion validates the
  required values and stores the report snapshot in the same transaction. A
  completed result cannot be edited or saved again.
- No patient codes, result contexts, result comments, flags, reference approval,
  or verifier/releaser steps exist.
- Completed reports print their stored values, labels, units and reference lines;
  later catalog edits do not alter them.
- Configuration is deactivated rather than hard-deleted, and every save is
  audited with the row before and after the change.

Build the solution with `dotnet build LabDesk.sln`. Rebuild/restart after editing
static files when running from source; the project copies them into its output.
`docs/openapi.yaml` documents the API contract.

## Troubleshooting

| Problem | Check |
| --- | --- |
| `net10.0` is not supported | Install the .NET 10 **SDK**, not only a runtime. Check `dotnet --version`. |
| Database login/connection fails | Check the instance is running, the database exists, and the connection string uses the correct Windows identity or login. |
| `lab_audit` (or another table) does not exist | Run the create-database script, then `--initialize` against the same configured database. |
| The port is already in use | Stop the other process or change `Server:Url`; check for a `PORT` override. |
| UI is missing in a copied folder | Copy all of `wwwroot/` with the executable. Do not move only the `.exe`. |
| The browser does not open | Open the configured URL manually. Browser launch is Windows-only and can be disabled for servers. |
| Native extraction/access error | Ensure the running account can write to its temporary directory; self-contained native libraries may be extracted there. |
| Health works but catalog does not | The health endpoint checks the HTTP process, not database connectivity. Check initialization and database settings. |
| The report shows the wrong laboratory name, address or phone | Check the `Lab` section of the published folder's `appsettings.json`. |
| The report shows the wrong reference lines | Check the parameter's `normal_ranges` on the test. Do not invent a replacement range. |

## Folder structure

```text
LabDesk.sln
README.md
publish.bat
publish.ps1
database/
├── schema.sql                 # Idempotent SQL Server tables and indexes
├── seed.sql                   # Idempotent SQL Server starter catalog
├── migrate-normal-ranges.sql  # One-off upgrade of an older database
└── drop-legacy.sql            # One-off removal of the old JSON table
docs/
└── openapi.yaml               # API documentation
src/
└── LabDesk.Api/
    ├── LabDesk.Api.csproj
    ├── Program.cs
    ├── appsettings.json
    ├── appsettings.Development.json
    ├── appsettings.Local.json # Optional, untracked personal settings
    ├── Data/                 # ADO.NET plumbing and one repository per concept
    ├── Models/               # Request, response and domain records
    ├── Services/             # The rules: validation, reports, snapshots
    └── wwwroot/
        ├── index.html
        ├── css/
        ├── js/
        └── pages/
```

Build/intermediate output (`bin/`, `obj/`), caches, personal settings and
published output are generated locally and excluded from source control.
