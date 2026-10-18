/*
  One-off removal of the legacy single-table storage.

  Run this ONLY after the application has been switched to the real tables
  (category, specimen, method, test, test_parameter, parameter_option, doctor,
  patient, lab_result, result_value, report_snapshot, report_line). Until then the
  application still reads lab_entity, and dropping it takes the entire catalog and
  every result with it.

  The rows in lab_entity are JSON payloads that cannot be rebuilt from the new
  tables. Take a backup first. Safe to run repeatedly.

  lab_audit is not touched: it is already a real table and keeps its history.
*/

SET NOCOUNT ON;

-- Counted through dynamic SQL on purpose: an ad-hoc batch binds every object
-- name when it compiles, so referring to dbo.test directly would fail the whole
-- script on a database where schema.sql has not been run yet.
DECLARE @hasNewCatalog BIT = 0;
IF OBJECT_ID(N'dbo.test', N'U') IS NOT NULL
BEGIN
    EXEC sp_executesql
        N'SELECT @has = CASE WHEN EXISTS (SELECT 1 FROM dbo.test) THEN 1 ELSE 0 END',
        N'@has BIT OUTPUT', @has = @hasNewCatalog OUTPUT;
END

IF OBJECT_ID(N'dbo.lab_entity', N'U') IS NULL
BEGIN
    PRINT 'dbo.lab_entity does not exist; nothing to do.';
END
ELSE IF @hasNewCatalog = 0
BEGIN
    -- Refuse rather than destroy the only copy of the catalog: if the new
    -- tables are missing or empty, this script would leave the laboratory with
    -- nothing.
    RAISERROR('Refusing to drop dbo.lab_entity: the new dbo.test table is missing or empty. Run schema.sql and seed.sql first.', 16, 1);
END
ELSE
BEGIN
    DROP TABLE dbo.lab_entity;
    PRINT 'Dropped dbo.lab_entity. The application must read the new tables.';
END
GO
