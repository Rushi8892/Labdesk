# LabDesk — real database tables, patients, doctors and printed reports

Date: 2026-10-18
Status: ready for approval

## 1. Why

Everything LabDesk stores — tests, their parameters, results, completed-report
snapshots — lives in one table as JSON blobs (`lab_entity`, columns
`entity_kind` / `parent_id` / `code_key` / `payload`). Nothing is queryable, no
relationship is enforced by the database, and code uniqueness is held together by
a string `code_key` and a filtered unique index.

The laboratory wants real tables: one for tests, one for their parameters, one
for their normal ranges, plus patients and referring doctors, and a printable
report with a proper letterhead.

## 2. What exists today

- `src/LabDesk.Api/Data/Repository.cs` — generic `List<T>`/`Get<T>`/`Save<T>`
  over JSON payloads; `Save` writes an entity then an audit row in one
  serializable transaction.
- `src/LabDesk.Api/Services/LabDeskService.cs` (945 lines) — all validation,
  reference selection, flag evaluation and snapshotting.
- `src/LabDesk.Api/Models/LabModels.cs` — records serialised to/from `payload`.
- `database/schema.sql` — the two generic tables. `database/seed.sql` — the
  starter catalog. `Data/SeedCatalog.cs` — the same seed for the PostgreSQL path.
- `docs/openapi.yaml` — the 12 endpoints, matches `Program.cs`.
- Live data right now (LocalDB `PathologyTests`): 12 tests, 37 parameters,
  4 categories, 5 specimens, 0 options, 0 references, 0 methods, 2 results,
  61 audit rows.

## 3. Goals

1. One table per concept, with real columns, foreign keys and unique constraints.
2. `test` has no price and no reference/range fields.
3. `doctor` and `patient` exist; a result points at a patient, and a patient
   points at a referring doctor.
4. Normal ranges belong to a parameter, one range per parameter.
5. Completed reports stay frozen: a printed report must not change when the
   patient record, test or parameter is edited later.
6. The printed report has a letterhead (logo, laboratory name, address, two phone
   numbers) and shows patient name, age, sex, referring doctor and dates above a
   body listing every parameter.
7. The application targets the local SQL Server database only.

## 4. Non-goals

- No multi-test reports. One result stays one test (patient → test → values →
  report).
- No reference-interval versioning, approval, contexts, critical thresholds or
  decision-value rules. That feature is deleted, including the References page
  and `approved_by`/`approved_at`/`version`.
- No price, cost, billing or invoicing anywhere.
- No per-draft copy of the test configuration (see §6, decision 1).
- No enforcement that a configured test can no longer be edited. The laboratory
  wants that, but will specify it later; this design only stops the *draft*
  machinery from depending on it.
- No user accounts, roles, CSV/PDF export beyond the browser's print, or labels.

## 5. Anti-goals

- A normal range the application invents or auto-fills. Ranges are typed by the
  laboratory or left empty; empty prints as "Not configured".
- Silent data loss: the old tables are dropped only by an explicit, separate
  script, never by normal startup.
- Losing the frozen snapshot: editing a test, patient or doctor after completion
  must not alter an already printed report.

## 6. Decisions already made (by the laboratory)

1. The whole reference-interval feature goes; one simple normal range per
   parameter, stored on the parameter itself.
2. Patient holds name, age, sex, phone, referring doctor. No address.
3. The existing rows are test data: re-seed instead of migrating them.
4. A configured test is not changed afterwards, so a draft does not need a
   private copy of its configuration. Drafts read the current catalog.
5. Report layout: logo, laboratory address and two phone numbers in the header;
   patient name, age, sex, referring doctor and the date below it; the parameters
   in the body.
6. SQL Server only. Replit and PostgreSQL are removed.
7. The letterhead (name, address, two phones, logo file) lives in
   `appsettings.json`, not in the database.

## 7. Target schema

Singular snake_case names. `active` exists wherever a row can be referenced, so
rows are deactivated rather than deleted — the existing project convention.

The letterhead is **not** a table. It lives in `appsettings.json` beside the
connection string, because it is installation configuration, not laboratory data:

```json
"Lab": {
  "Name": "YOUR LABORATORY NAME",
  "Address": "Street, Area, City",
  "Phone1": "+00 00000 00000",
  "Phone2": "+00 00000 00000",
  "Logo": "logo.svg"
}
```

`Lab:Logo` is a file name inside `wwwroot`, resolved to `/logo.svg` by the page.
The shipped value points at the existing `favicon.svg`; dropping a new image into
`wwwroot` and changing this one setting replaces the logo, exactly like the
connection string.

```
doctor            id            INT IDENTITY PK
                  name          NVARCHAR(200) NOT NULL
                  active        BIT NOT NULL DEFAULT 1

patient           id            INT IDENTITY PK
                  name          NVARCHAR(200) NOT NULL
                  age           DECIMAL(5,2)  NOT NULL     -- years, fractions allowed (infants)
                  sex           VARCHAR(10)   NOT NULL     -- Male | Female | Other
                  phone         VARCHAR(30)   NULL
                  doctor_id     INT           NULL FK → doctor(id)
                  active        BIT NOT NULL DEFAULT 1
                  created_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()

category          id, code VARCHAR(40) UNIQUE, name NVARCHAR(200), active BIT
specimen          id, code VARCHAR(40) UNIQUE, name NVARCHAR(200), active BIT
method            id, code VARCHAR(40) UNIQUE, name NVARCHAR(200), active BIT

test              id            INT IDENTITY PK
                  code          VARCHAR(40)  NOT NULL UNIQUE
                  name          NVARCHAR(200) NOT NULL
                  short_name    NVARCHAR(60)  NULL
                  category_id   INT NULL FK → category(id)
                  specimen_id   INT NULL FK → specimen(id)
                  method_id     INT NULL FK → method(id)
                  description            NVARCHAR(1000) NULL
                  patient_preparation    NVARCHAR(1000) NULL
                  collection_instructions NVARCHAR(1000) NULL
                  container              NVARCHAR(200) NULL
                  minimum_sample         NVARCHAR(200) NULL
                  turnaround_time        NVARCHAR(100) NULL
                  report_title           NVARCHAR(200) NULL
                  notes                  NVARCHAR(1000) NULL
                  display_order INT NOT NULL DEFAULT 0
                  active        BIT NOT NULL DEFAULT 1
                  -- price and every reference/range field: removed

test_parameter    id            INT IDENTITY PK
                  test_id       INT NOT NULL FK → test(id)
                  code          VARCHAR(40)  NOT NULL
                  name          NVARCHAR(200) NOT NULL
                  data_type     VARCHAR(20)  NOT NULL  -- Numeric|Text|Dropdown|Boolean|Date
                  unit          NVARCHAR(40) NULL
                  result_format NVARCHAR(40) NULL
                  decimal_places INT NULL
                  required      BIT NOT NULL DEFAULT 0
                  allow_negative BIT NOT NULL DEFAULT 0
                  technical_min DECIMAL(18,4) NULL
                  technical_max DECIMAL(18,4) NULL
                  normal_lower  DECIMAL(18,4) NULL      -- one normal range, on the parameter
                  normal_upper  DECIMAL(18,4) NULL
                  normal_text   NVARCHAR(200) NULL      -- for Text/Dropdown/Boolean normals
                  display_order INT NOT NULL DEFAULT 0
                  active        BIT NOT NULL DEFAULT 1
                  notes         NVARCHAR(1000) NULL
                  UNIQUE (test_id, code)
                  CHECK (normal_lower IS NULL OR normal_upper IS NULL OR normal_lower <= normal_upper)

parameter_option  id, parameter_id FK → test_parameter(id), code VARCHAR(40),
                  label NVARCHAR(200), sort_order INT, abnormal BIT, active BIT
                  UNIQUE (parameter_id, code)

lab_result        id            INT IDENTITY PK
                  patient_id    INT NOT NULL FK → patient(id)
                  test_id       INT NOT NULL FK → test(id)
                  collected_at  DATETIME2 NOT NULL
                  status        VARCHAR(20) NOT NULL   -- Draft | Completed
                  created_at    DATETIME2 NOT NULL
                  updated_at    DATETIME2 NOT NULL
                  completed_at  DATETIME2 NULL

result_value      id, result_id FK → lab_result(id) ON DELETE CASCADE,
                  parameter_id FK → test_parameter(id),
                  value NVARCHAR(200), flag VARCHAR(20), normal_text NVARCHAR(200)
                  UNIQUE (result_id, parameter_id)

report_snapshot   id, result_id FK → lab_result(id) UNIQUE,
                  report_title, test_name, test_code NVARCHAR(200),
                  patient_name NVARCHAR(200), age DECIMAL(5,2), sex VARCHAR(10),
                  doctor_name NVARCHAR(200) NULL,        -- frozen, so a later
                                                         -- doctor change cannot
                                                         -- rewrite a printed report
                  collected_at DATETIME2, completed_at DATETIME2

report_line       id, snapshot_id FK → report_snapshot(id) ON DELETE CASCADE,
                  name, code, unit, value, normal_text, flag, option_label,
                  display_order INT

audit             UNCHANGED — `lab_audit` already has real columns today
                  (entity_name, entity_id, action_name, actor, created_at,
                  details). It keeps its name and shape; no new audit table is
                  created and no code changes touch it.
```

Count: 12 new tables. `lab_entity` is the only table that goes away.

`result_value` points at the live parameter, which is what decision 4 buys: no
captured-configuration store. Values whose parameter was deactivated are dropped
on save rather than rejected, so a draft can always be saved.

`report_snapshot`/`report_line` are written in the same transaction that flips a
result to Completed, and copy the printed text. The letterhead comes from
`appsettings.json` at print time — it is the laboratory's identity, not the
patient's data — while patient name, age, sex, doctor and dates are frozen in the
snapshot.

## 8. Behavior changes

- **Flagging.** Numeric: below `normal_lower` → `Low`, above `normal_upper` →
  `High`, otherwise blank. Text/Dropdown/Boolean: not matching `normal_text`
  (case-insensitive; for Dropdown the option *label* is compared) → `Abnormal`.
  An option marked `abnormal` always yields `Abnormal`. No critical flags, no
  decision rules, no ambiguity resolution — there is nothing to resolve with one
  range.
- **No reference selection.** `SelectReference`, `Overlap`, `SameContext`,
  `DateOverlap`, `ApproveReference` and the age/sex specificity ranking are
  deleted (~250 lines).
- **Validation kept.** Required values, numeric parsing, decimal places,
  negative and technical-min/max limits stay as they are today.
- **Audit.** Same shape as today: one row per create/update/complete, with before
  and after JSON in `details`. No accounts are added.
- **Draft edits** read the current catalog and ignore values for parameters that
  are no longer applicable. Completed results stay immutable.
- **Concurrency.** Unchanged from today: the server re-reads the result inside
  the write transaction and rejects the save if `status` or `updated_at` moved
  (`LabDeskService.cs:870-879`). No client-supplied version token is added.
- **Report print layout.** Header: logo (or the built-in mark when none is
  uploaded), laboratory name, address, phone 1 and phone 2. Below it: patient
  name, age, sex, referring doctor, and both the collection date and the report
  date. Body: one row per parameter — name, result (or option label), unit,
  normal range text, flag.

## 9. Old data

Start clean, as agreed:

- `database/schema.sql` gains the new tables and keeps its existence checks.
- `database/seed.sql` is rewritten to insert the same 12 tests, 37 parameters,
  4 categories and 5 specimens into the new tables (no price, no
  `reference_type`).
- `appsettings.json` gains the `Lab` block with placeholder letterhead values.
- A separate one-off `database/drop-legacy.sql` drops `lab_entity`, the only
  table whose contents move into the new ones. It is never executed by startup
  or `--initialize`, and must not be run until the application reads the new
  tables. Guarded with `IF OBJECT_ID(N'dbo.lab_entity', N'U') IS NOT NULL`.
- `--initialize` on an already-initialised database still must not re-seed.

## 10. Impact on the API and UI (detail in the plan)

- `POST /api/tests`, `/api/parameters`, `/api/options`, `/api/masters` keep their
  routes; bodies lose `price`, `referenceType`, `displayReferenceText`, and the
  parameter body gains `normalLower`, `normalUpper`, `normalText`.
- `POST /api/references` and `/references/{id}/approve` are removed, along with
  the References page.
- New: `GET/POST /api/doctors`, `GET/POST /api/patients`.
- `POST /api/results` takes `patientId` instead of `patientName`/`age`/`sex`.
- The letterhead needs no endpoint and no page: it is read from configuration.
- UI: new Patients and Doctors pages; result entry picks a patient and then a
  test; the normal range is edited on the parameter row inside Test detail; the
  print stylesheet renders the letterhead.
- Removed with Replit: `.replit`, `.replitignore`, `scripts/post-merge.sh`,
  `replit.md`, the `Npgsql` package, `Repository.InitializePostgreSqlAsync`, the
  PostgreSQL connection-string handling and its environment variables,
  `Data/SeedCatalog.cs`, and the PostgreSQL section of `README.md`.

## 11. Constraints to respect

- ADO.NET with bound parameters only. No Entity Framework.
- Keep the `Data` / `Models` / `Services` / `wwwroot` layout and the plain
  HTML/CSS/vanilla-JS interface with no build step.
- One process serves UI and API on one port.
- `appsettings.Local.json` stays untracked and unpublished.
- **Column widths vs validation.** Codes become `VARCHAR(40)`; `CheckCode`
  (currently 255) is tightened to 40 so an over-long code is a clean 400, not a
  SQL truncation error. Names cap at 200, notes/descriptions at 1000. The seeded
  codes are all 10 characters or fewer.
- **Timestamps.** Collection time keeps today's meaning: the value typed into the
  date/time field is treated as UTC, as `Date(..., AssumeUniversal)` does now.
  `DATETIME2` matches the rest of the schema; no `DATETIMEOFFSET` conversion.
- **Patient picker.** No laboratory-issued patient number; a patient is found by
  name and phone in the picker list.
- **Deactivate, never delete.** `active` on `doctor` and `patient` for the same
  reason as the catalog tables: results reference them.
- Still-relevant constraints from the removed `replit.md` move into `README.md`
  so no standing rule is lost with the file.

## 12. Shortcuts with known limits

- `shortcut:` one normal range per parameter, no sex or age bands. Male/female
  hemoglobin and creatinine differences cannot be expressed. Upgrade by adding
  `normal_lower_male`/`normal_upper_male`, or by promoting the range back to its
  own table, when the laboratory actually needs it. This comment goes in
  `schema.sql` and on the parameter editor.
- `shortcut:` report snapshots copy display text rather than referencing the
  catalog. That is the point (frozen reports), and it is why `report_line` has no
  foreign keys to `test_parameter`.
- `shortcut:` the studio prints through the browser (`window.print()`), with a
  print stylesheet. No PDF generation.

## 13. Phases

1. **Database** (this request): `schema.sql`, `seed.sql`, `drop-legacy.sql`,
   SQL Server only, plus README updates. Verified by running `--initialize`
   against a clean database and checking row counts, foreign keys and the
   `Lab` configuration block.
2. **Repository**: typed per-table data access; delete the generic entity model,
   `SeedCatalog` and the PostgreSQL path, and stop creating `lab_entity` in
   `schema.sql` (otherwise `--initialize` keeps recreating a dead table).
3. **Doctors and patients**: patients and doctors lists plus add/edit.
4. **Tests, parameters, options and normal ranges**: drop price and the reference
   fields from the Test form; edit the range on the parameter row.
5. **Results and reports**: patient-picker entry flow, snapshot tables, flag
   rules, print layout with the configured letterhead.
6. **Verification**: one small test project for flag evaluation and snapshot
   freezing (both are pure logic and need no database).

## 14. Deferred by the laboratory

- Making a configured test uneditable once it has been used, and what happens to
  results that already exist when a test is retired. To be specified later; this
  design does not depend on it.
