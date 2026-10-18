/*
  One-off removal of the legacy single-table storage.

  Run this ONLY after the application has been switched to the real tables
  (category, specimen, method, test, test_parameter, parameter_option, doctor,
  patient, lab_result, result_value, report_snapshot, report_line).

  It destroys data that schema.sql and seed.sql do not copy anywhere. Only the
  starter catalog is seeded, so every result, every result value and every report
  snapshot that still lives in lab_entity is gone permanently, and it is too late
  to take a backup afterwards. Back up the database first.

  Because of that it refuses to run unless it is explicitly confirmed, whatever
  the state of the database:

      sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -i drop-legacy.sql -v ConfirmDrop=YES

  With SSMS, switch the query window to SQLCMD mode and add
  `:setvar ConfirmDrop YES` above the script. The flag cannot be flipped by
  editing the file, only by passing it in.

  Safe to run repeatedly. lab_audit is not touched: it is already a real table
  and keeps its history.
*/

SET NOCOUNT ON;

-- sqlcmd substitutes $(ConfirmDrop); nothing else does, so an unconfirmed run
-- compares against the literal text and refuses.
DECLARE @ConfirmDrop BIT = CASE WHEN N'$(ConfirmDrop)' = N'YES' THEN 1 ELSE 0 END;
DECLARE @LegacyRows INT = 0;

-- Counted through dynamic SQL on purpose: an ad-hoc batch binds every object
-- name when it compiles, so referring to dbo.lab_entity directly would fail the
-- whole script on a database that has already been migrated.
IF OBJECT_ID(N'dbo.lab_entity', N'U') IS NOT NULL
BEGIN
    EXEC sp_executesql
        N'SELECT @n = COUNT(*) FROM dbo.lab_entity',
        N'@n INT OUTPUT', @n = @LegacyRows OUTPUT;
END

IF OBJECT_ID(N'dbo.lab_entity', N'U') IS NULL
BEGIN
    PRINT 'dbo.lab_entity does not exist; nothing to do.';
END
ELSE IF @ConfirmDrop = 0
BEGIN
    RAISERROR('Refusing to drop dbo.lab_entity: it still holds %d rows, and any result or snapshot among them exists nowhere else. Confirm with -v ConfirmDrop=YES only when the application reads the new tables.', 16, 1, @LegacyRows);
END
ELSE
BEGIN
    PRINT 'Dropping dbo.lab_entity and destroying whatever it still holds.';
    EXEC sp_executesql N'DROP TABLE dbo.lab_entity';
    PRINT 'Dropped dbo.lab_entity. The application must read the new tables.';
END
GO
