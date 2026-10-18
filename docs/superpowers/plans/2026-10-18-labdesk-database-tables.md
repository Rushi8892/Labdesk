# LabDesk Database Tables Implementation Plan (Phase 1 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single JSON `lab_entity` table with 12 real, related SQL Server tables, seeded with the existing 12-test catalog.

**Architecture:** Pure SQL Server DDL and seed data, applied with the same idempotent scripts the application already ships (`database/schema.sql`, `database/seed.sql`), plus a separate one-off `database/drop-legacy.sql` that is written but **not run** in this phase. This phase is additive: the running application keeps reading `lab_entity` until the repository work in phase 2, so nothing breaks mid-migration.

**Tech Stack:** SQL Server (LocalDB `(localdb)\MSSQLLocalDB`, database `PathologyTests`), `sqlcmd` for verification, ASP.NET Core configuration JSON for the letterhead.

**Spec:** `docs/superpowers/specs/2026-10-18-labdesk-sql-schema-design.md`

## Global Constraints

- ADO.NET with bound parameters only; no Entity Framework (later phases).
- Keep the `Data` / `Models` / `Services` / `wwwroot` layout and the plain HTML/CSS/vanilla-JS interface with no build step.
- One process serves UI and API on one port.
- `appsettings.Local.json` stays untracked and unpublished.
- Codes are `VARCHAR(40)`; names cap at 200; notes/descriptions at 1000.
- Timestamps are UTC in `DATETIME2`; no `DATETIMEOFFSET`.
- Rows referenced by others are deactivated (`active`), never deleted.
- Every script stays safe to run repeatedly; `--initialize` must never re-seed an existing catalog.
- `drop-legacy.sql` must not run until phase 2 switches the code over.
- Do not start the application or run `dotnet build` while the app is running: it locks `bin\Debug\net10.0\LabDesk.Api.exe`. Apply scripts with `sqlcmd` instead.

## Review Focus

- **Running the scripts twice.** A second run must create nothing and insert nothing, with no error — operators will re-run them.
- **Codes differing only by case** (`cbc` beside `CBC`). The database collation is case-insensitive, so uniqueness must reject the second one rather than silently allow two.
- **A parameter with no normal range.** All 37 seeded parameters have none; the columns must accept NULL and the value must print as "Not configured" (phase 5), not blank or zero.
- **A patient pointing at a doctor that does not exist.** Must be refused by the database, not stored as an orphan.
- **A normal range with the bounds reversed.** `normal_lower` above `normal_upper` must be refused by the database.

---

### Task 1: The 12 new tables

**Files:**
- Modify: `database/schema.sql` (append to the existing file; keep the current `lab_entity` and `lab_audit` definitions untouched)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `doctor`, `patient`, `category`, `specimen`, `method`, `test`, `test_parameter`, `parameter_option`, `lab_result`, `result_value`, `report_snapshot`, `report_line`, with the columns, keys and constraints exactly as listed in spec §7.

- [ ] **Step 1: Confirm the tables do not exist yet**

```powershell
sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -Q "SELECT COUNT(*) AS existing FROM sys.tables WHERE name IN ('doctor','patient','category','specimen','method','test','test_parameter','parameter_option','lab_result','result_value','report_snapshot','report_line')"
```

Expected: `0`.

- [ ] **Step 2: Write the DDL into `database/schema.sql`**

One `IF OBJECT_ID(N'dbo.<name>', N'U') IS NULL BEGIN ... END; GO` block per table, in dependency order (referenced tables first): `doctor`, `category`, `specimen`, `method`, then `patient`, `test`, then `test_parameter`, `parameter_option`, then `lab_result`, `result_value`, `report_snapshot`, `report_line`. Match the existing file's style: `dbo.` prefix, named primary keys (`pk_<table>`), named defaults (`df_<table>_<column>`) where a default exists, `BIT NOT NULL DEFAULT 0` written as an explicit named constraint, and `GO` between blocks.

Constraints to include, named so failures are readable:
- Unique: `uq_category_code`, `uq_specimen_code`, `uq_method_code`, `uq_test_code`, `uq_test_parameter_test_code (test_id, code)`, `uq_parameter_option_parameter_code (parameter_id, code)`, `uq_result_value_result_parameter (result_id, parameter_id)`, `uq_report_snapshot_result (result_id)`.
- Foreign keys: `fk_patient_doctor`, `fk_test_category`, `fk_test_specimen`, `fk_test_method`, `fk_test_parameter_test`, `fk_parameter_option_parameter`, `fk_lab_result_patient`, `fk_lab_result_test`, `fk_result_value_result`, `fk_result_value_parameter`, `fk_report_snapshot_result`, `fk_report_line_snapshot`. Only `fk_result_value_result` and `fk_report_line_snapshot` use `ON DELETE CASCADE`; the rest are `NO ACTION`.
- Checks: `ck_test_parameter_normal_bounds` (`normal_lower IS NULL OR normal_upper IS NULL OR normal_lower <= normal_upper`), `ck_lab_result_status` (`status IN ('Draft','Completed')`).
- Index: `ix_lab_result_patient` on `lab_result(patient_id)`, `ix_lab_result_test` on `lab_result(test_id)`, `ix_test_parameter_test` on `test_parameter(test_id)`, `ix_patient_doctor` on `patient(doctor_id)`.
- A comment at the top of the new section stating the `shortcut:` one-range-per-parameter limit from spec §12 and when to upgrade.

- [ ] **Step 3: Apply the script and count the tables**

```powershell
sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -b -I -i ".\database\schema.sql"
sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -Q "SELECT COUNT(*) AS created FROM sys.tables WHERE name IN ('doctor','patient','category','specimen','method','test','test_parameter','parameter_option','lab_result','result_value','report_snapshot','report_line')"
```

Expected: no errors, then `12`.

- [ ] **Step 4: Prove the constraints actually bite**

```powershell
sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -Q "BEGIN TRAN; INSERT dbo.category(code,name) VALUES('hem','dup'); ROLLBACK;"
sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -Q "BEGIN TRAN; INSERT dbo.patient(name,age,sex,doctor_id) VALUES('x',1,'Male',999999); ROLLBACK;"
sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -Q "BEGIN TRAN; INSERT dbo.test(code,name) VALUES('X','x'); INSERT dbo.test_parameter(test_id,code,name,data_type,normal_lower,normal_upper) VALUES(SCOPE_IDENTITY(),'P','p','Numeric',10,5); ROLLBACK;"
```

Expected, in order: `uq_category_code` violation (case-insensitive, so `hem` clashes with the seeded `HEM` only if the catalog is seeded first — on a fresh database expect a successful insert and no error, re-run after Task 2 to see it), `fk_patient_doctor` violation, `ck_test_parameter_normal_bounds` violation. Each statement must be rolled back; `SELECT COUNT(*) FROM dbo.category` afterwards must be unchanged.

- [ ] **Step 5: Commit**

```bash
git add database/schema.sql
git commit -m "feat(db): add real tables for tests, parameters, ranges, patients and doctors"
```

---

### Task 2: Seed the starter catalog into the new tables

**Files:**
- Modify: `database/seed.sql` (replace its contents)

**Interfaces:**
- Consumes: the tables from Task 1.
- Produces: 4 `category` rows, 5 `specimen` rows, 12 `test` rows, 37 `test_parameter` rows, and no `parameter_option` rows. Every `normal_lower`/`normal_upper`/`normal_text` is NULL.

- [ ] **Step 1: Confirm the new catalog is empty**

```powershell
sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -Q "SELECT (SELECT COUNT(*) FROM dbo.test) AS tests, (SELECT COUNT(*) FROM dbo.category) AS cats"
```

Expected: `0, 0`.

- [ ] **Step 2: Rewrite `database/seed.sql`**

Port the 4 categories, 5 specimens and 12 test definitions **verbatim** from the current `database/seed.sql` (same codes, names, units, display order and per-test parameter lists), dropping `price`, `reference_type` and `display_reference_text` and leaving the three `normal_*` columns NULL. Keep the existing guard so a populated catalog is never touched:

```sql
IF EXISTS (SELECT 1 FROM dbo.test) RETURN;   -- never reseed a lab's catalog
```

Insert with explicit column lists and idempotent lookups (`INSERT ... SELECT ... WHERE NOT EXISTS`), so running it twice against a seeded database is a no-op. Wrap the whole catalog in one transaction so a partial seed cannot happen.

- [ ] **Step 3: Apply and verify the counts**

```powershell
sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -b -i ".\database\seed.sql"
sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -Q "SELECT (SELECT COUNT(*) FROM dbo.category) AS cats, (SELECT COUNT(*) FROM dbo.specimen) AS specimens, (SELECT COUNT(*) FROM dbo.test) AS tests, (SELECT COUNT(*) FROM dbo.test_parameter) AS params, (SELECT COUNT(*) FROM dbo.test_parameter WHERE normal_lower IS NOT NULL OR normal_upper IS NOT NULL OR normal_text IS NOT NULL) AS ranged"
```

Expected: `4, 5, 12, 37, 0`.

- [ ] **Step 4: Run it a second time and re-verify**

```powershell
sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -b -i ".\database\seed.sql"
```

Expected: no error, and the counts from Step 3 unchanged. Then re-run the case-insensitive uniqueness check from Task 1 Step 4 and expect the `uq_category_code` violation.

- [ ] **Step 5: Commit**

```bash
git add database/seed.sql
git commit -m "feat(db): seed the starter catalog into the new tables"
```

---

### Task 3: The one-off legacy drop

**Files:**
- Create: `database/drop-legacy.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: a script that removes `lab_entity`, which no later task may run in this phase.

- [ ] **Step 1: Write the script**

Header comment stating: it removes the old single-table storage, it must run **only after** the application reads the new tables, it deletes every result and catalog row stored as JSON, and it is safe to run repeatedly. Body: `IF OBJECT_ID(N'dbo.lab_entity', N'U') IS NOT NULL DROP TABLE dbo.lab_entity;` and leave `lab_audit` alone.

- [ ] **Step 2: Verify it parses without running it**

```powershell
sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -b -Q "SET NOEXEC ON" -i ".\database\drop-legacy.sql"
```

Expected: no error (parsed, nothing executed), and `SELECT COUNT(*) FROM sys.tables WHERE name='lab_entity'` still returns `1`.

- [ ] **Step 3: Commit**

```bash
git add database/drop-legacy.sql
git commit -m "feat(db): add the one-off script that drops the legacy JSON table"
```

---

### Task 4: The letterhead in configuration

**Files:**
- Modify: `src/LabDesk.Api/appsettings.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a `Lab` configuration section read as `Lab:Name`, `Lab:Address`, `Lab:Phone1`, `Lab:Phone2`, `Lab:Logo` (`Lab:Logo` is a file name inside `wwwroot`, empty or missing means print no logo).

- [ ] **Step 1: Add the `Lab` block**

Placeholder values matching the project's existing style of obvious placeholders: `YOUR LABORATORY NAME`, a street line, two phone placeholders, and `"Logo": "favicon.svg"` so the report prints the built-in mark until a real file is dropped into `wwwroot`.

- [ ] **Step 2: Verify the application still reads its configuration**

```powershell
powershell -ExecutionPolicy Bypass -File .\publish.ps1
```

Expected: publish succeeds. (Skipping the publish is acceptable if it is unavailable; `appsettings.json` is copied verbatim, so the check is that the JSON parses and the `Lab` block is present.)

- [ ] **Step 3: Commit**

```bash
git add src/LabDesk.Api/appsettings.json
git commit -m "feat(config): letterhead name, address, phones and logo"
```

---

### Task 5: Document the new storage

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: accurate operator documentation. PostgreSQL text is left alone here; it is removed with its code in phase 2.

- [ ] **Step 1: Replace the storage description**

Section 2 currently describes "two physical tables by design" and that categories and test types do not each get their own table. Replace it with the real list: the 12 new tables, what `lab_audit` still does, that `lab_entity` is the old JSON table kept only until the code moves, and that `database/drop-legacy.sql` removes it afterwards.

- [ ] **Step 2: Document the letterhead**

In the configuration section, add the `Lab` block and say that `Lab:Logo` names a file inside `wwwroot`, so a new logo is a new file plus one setting — and that the letterhead is read at print time, so an old reprinted report shows the current letterhead.

- [ ] **Step 3: Update the troubleshooting table and folder listing**

Add a row for "the report prints the wrong name/address" (check the `Lab` block in the published `appsettings.json`), and list `database/drop-legacy.sql` in the folder structure.

- [ ] **Step 4: Verify the claims in the README against the database**

```powershell
sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -Q "SELECT name FROM sys.tables ORDER BY name"
```

Expected: exactly the tables the README now lists.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: describe the new tables and the letterhead configuration"
```

---

## Phase 1 done when

- 12 new tables exist, re-running `schema.sql` changes nothing, re-running `seed.sql` changes nothing.
- The catalog is readable in the new tables: 4 categories, 5 specimens, 12 tests, 37 parameters, no normal ranges.
- The three constraint checks from Task 1 Step 4 fail as designed and leave no rows behind.
- `drop-legacy.sql` exists, parses, and has not been run.
- `Lab` settings are in `appsettings.json`.
- The running application was never interrupted and still serves on its current port.
