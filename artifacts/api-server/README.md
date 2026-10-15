# LabDesk API

Development ASP.NET Core Minimal API on .NET 10, with ADO.NET repositories (no EF Core). The contract in `lib/api-spec/openapi.yaml` is authoritative; routes are served beneath `/api` and JSON is camel-cased. This is a development workbench, not a clinical production system. Operator names are attribution fields, not authentication.

## Run

From the repository root, use `pnpm --filter @workspace/api-server run dev`; the managed workflow injects `PORT` and ASP.NET binds to `0.0.0.0`. `pnpm --filter @workspace/api-server run build` builds the API. Directly, `dotnet run --project artifacts/api-server/LabDesk.Api.csproj`.

## Development database setup

The server never runs DDL or migrations on startup. Initialize a development database explicitly once:

```sh
DB_PROVIDER=PostgreSql dotnet run --project artifacts/api-server/LabDesk.Api.csproj -- --initialize
```

The PostgreSQL script is `database/postgresql.sql`. It uses `DATABASE_URL`, or `DB_CONNECTION_STRING`, or the standard `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE` variables. PostgreSQL URI-form `DATABASE_URL` values are supported. Initialization creates the schema and a starter catalog only when no tests exist. The catalog includes 12 starter tests and parameters/units; it intentionally seeds no patient/result data, reference intervals, or parameter options. Add lab-approved reference values and dropdown choices through the configuration API.

For a new local SQL Server database, run `database/create-local-sqlserver.sql` in SQL Server Management Studio or Azure Data Studio. It creates the `PathologyTests` database and the tables used by the application. Then initialize the starter catalog from the repository root:

```powershell
$env:DB_PROVIDER = "SqlServer"
$env:DB_CONNECTION_STRING = "Server=localhost;Database=PathologyTests;Trusted_Connection=True;TrustServerCertificate=True"
dotnet run --project artifacts/api-server/LabDesk.Api.csproj -- --initialize
```

The initializer adds the starter categories, specimen types, tests, and parameters if the catalog is empty. For an existing database, apply `database/sqlserver.sql` while connected to that database instead. The application connection must point to the database you created:

```text
DB_PROVIDER=SqlServer
DB_CONNECTION_STRING='Server=...;Database=...;User Id=...;Password=...;Encrypt=True;TrustServerCertificate=True'
```

The explicit initializer can also apply that schema and seed catalog: `dotnet run --project artifacts/api-server/LabDesk.Api.csproj -- --initialize` with those variables set. Keep connection strings in environment/secrets, never source control. To switch providers, apply the corresponding provider script and change the environment settings; the application does not copy or migrate data between database engines.

## Persistence notes

Repositories use `DbConnection`/`DbTransaction`, parameterized values, provider-neutral SQL and separate Npgsql/Microsoft.Data.SqlClient connection factories. Entity records use a relational envelope (`entity_kind`, identity, parent identity, normalized code key, active bit, timestamps, and a text payload); database uniqueness on `(entity_kind,parent_id,code_key)` enforces case-insensitive codes after invariant uppercase normalization. Audit events are relational rows. The payload is ordinary JSON text, not JSONB: filtering, identity generation, timestamps, and parameter binding avoid provider-specific JSON query features. Both SQL schema scripts match this model. Parent relationships are additionally validated by the service before writes.

Configuration mutations record before/after audit detail. Approved references are versioned rather than edited in place. Result releases save the report snapshot and audit record in one transaction; report retrieval reads only that immutable released snapshot.