# LabDesk

A desktop laboratory workstation for metadata-driven test configuration,
dynamic result entry and immutable printable completed reports.

## Architecture and standing constraints

- Use .NET 10 / ASP.NET Core and ADO.NET, never Entity Framework.
- Keep `LabDesk.sln` at the root. The project is `src/LabDesk.Api/`.
- Keep backend source organized in `Data`, `Models` and `Services`. The project
  root contains startup/configuration; `wwwroot` contains the static interface.
- The UI must be plain HTML, CSS and vanilla JavaScript with separate `css`,
  `js` and `pages` files. It has no dependencies or frontend compilation step.
- Serve the static UI and `/api` from the same .NET process, origin and port.
  Browser requests use relative `/api` URLs; do not introduce a separate UI server.
- The interface is desktop-only: dense sidebar navigation, data tables and
  split panels. No mobile/responsive layouts are required.
- Microsoft SQL Server is the final/local database. Replit PostgreSQL is
  temporary development storage. The user needs source code, not hosted data.
- SQL lives behind the ADO.NET repository and all values are bound parameters.
- Use one configurable engine across every category, never category-specific tables.
- Do not change the starter catalog or invent/auto-approve medical reference ranges.
- Tests own their parameters. Configuration is deactivated, not hard-deleted.
- Results have exactly Draft and Completed states. Drafts are editable;
  completion validates and atomically snapshots/locks the result.
- No patient code, result Context, result comments, parameter status dropdown,
  verifier, or release stage belongs in result entry or reports.
- Select references using age/sex with the existing general fallback. Context
  remains reference configuration metadata, not result input.
- Existing drafts use their captured configuration; completed reports use only
  their stored values, labels, units, references, flags and option labels.
- Reference interval approval/versioning remains separate from result completion.
- Audit important configuration changes.

## Configuration and local execution

- `appsettings.json` defaults to SqlServer with placeholders.
- `appsettings.Development.json` contains a LocalDB example.
- Optional `appsettings.Local.json` is ignored and never published automatically.
- Environment overrides remain supported: `DB_PROVIDER`, `DB_CONNECTION_STRING`,
  `DATABASE_URL`, `PG*`, `PORT`, and `ASPNETCORE_URLS`.
- Without an explicit DB_PROVIDER, DATABASE_URL or PGHOST selects PostgreSQL to
  preserve the temporary Replit setup. Otherwise SQL Server is the default.
- The only SQL files are `database/schema.sql` and `database/seed.sql`.
  The schema script is idempotent and defines the two generic repository tables:
  `lab_entity` and `lab_audit`. Do not add category-specific tables.
- Create the SQL Server database in SSMS, select it, then execute `schema.sql`
  followed by `seed.sql`. The seed script matches the existing starter catalog
  and leaves databases with tests untouched.
- `dotnet run --project src/LabDesk.Api -- --initialize` applies both SQL files
  for SQL Server. Temporary PostgreSQL development schema and starter data are
  initialized by the repository/seeder code, so no extra SQL file is required.
- Never auto-reseed existing tests or reset lab data on normal startup.
- Start UI and API: `dotnet run --project src/LabDesk.Api`.
- Default local address: `http://localhost:5000`; health is `/api/healthz`.
- On Windows, open the default browser after startup unless disabled in settings.
- The Replit workflow runs the .NET project directly with its configured port.
  Keep its build/intermediate output under the ignored `.cache/dotnet` directory.
- `scripts/post-merge.sh` restores .NET dependencies only; it must not change data.

## Executable distribution

`publish.bat` and `publish.ps1` publish a self-contained single-file Windows x64
application to `publish/LabDesk/`. Do not trim database/JSON dependencies. Include
native libraries for extraction. Ship the entire output folder: executable,
external appsettings, wwwroot and database scripts. The target needs no installed
.NET runtime, but it still needs access to SQL Server. Read configuration beside
the executable, not from an arbitrary launch working directory. Keep build,
intermediate and published output out of source control.

See README.md for Windows setup, initialization, running and copying the output.
`docs/openapi.yaml` is API documentation, not an executable dependency.

## Development safety boundary

This is a single-laboratory development workbench. Typed reference-approval names
are audit attribution, not authenticated identity. Do not use real patient data
or expose the app publicly without authenticated accounts, authorization,
operational validation and the laboratory's clinical sign-off. No medical
reference intervals are clinically validated by the application.

Never expose connection strings or credentials in source-code handoffs.
