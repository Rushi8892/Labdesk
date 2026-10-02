# LabDesk

A desktop laboratory workstation for configurable test catalogs, dynamic result entry, contextual reference approvals, and printable released reports.

## Product constraints

- Use one metadata-driven engine for all categories. Never introduce category-specific tables or result-entry screens.
- The user wants a desktop-style application: dense sidebar navigation, tables and split panels. No responsive or mobile layouts are required.
- The user needs source code, not hosted data. Replit PostgreSQL is temporary; the final database is Microsoft SQL Server.
- The backend must be .NET with ADO.NET, not Entity Framework. Keep SQL in a repository layer and bind all values as parameters.
- Starter catalog: CBC, Fasting Blood Glucose, Postprandial Blood Glucose, HbA1c, Lipid Profile, Liver Function Test, Kidney Function Test, Thyroid Profile, Urinalysis, Stool Routine Examination, ESR, CRP.
- Seed parameter names, types and units. Never invent medical reference intervals or auto-approve references. Dropdown choices are laboratory configuration.
- Never hard-delete configuration. Released reports are immutable snapshots, not renders of current configuration.

## Run & operate

- `pnpm --filter @workspace/api-server run dev` — .NET API under `/api`, port supplied by its managed workflow.
- `pnpm --filter @workspace/labdesk run dev` — desktop frontend, port and base path supplied by its managed workflow.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate typed API clients after changing the API contract.
- `pnpm run typecheck` — TypeScript workspace checks.
- See the backend README and `database/` scripts for initialization and SQL Server setup.

## Source map

- `artifacts/labdesk/` — React frontend rendered as HTML/CSS/JavaScript.
- `artifacts/api-server/` — ASP.NET API, repository, domain validation and workflow logic.
- `lib/api-spec/openapi.yaml` — API contract.
- `lib/api-client-react/` — generated typed frontend API calls.
- `database/` — database schema scripts.

## Development safety boundary

This version is a single-laboratory development workbench. Operator-entered approval and verification names are audit attribution, not authenticated identity. Do not enter real patient data until authenticated accounts, authorization, operational validation and the laboratory's clinical sign-off are in place. No seeded medical reference intervals are clinically validated.

Do not silently substitute a different runtime or database provider. Do not expose connection strings, environment secrets, or database data in source-code handoffs.