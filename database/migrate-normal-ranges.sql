/*
  Moves an existing LabDesk database from the old shape to the current one:

    test_parameter.normal_lower / normal_upper / normal_text -> normal_ranges
    result_value.flag, normal_text                            -> normal_ranges
    report_line.flag, normal_text                             -> normal_ranges
    parameter_option.abnormal                                 -> dropped

  normal_ranges is a JSON array of the lines a row prints, one entry per line:
  ["Male: 65-176 ug/dL", "Female: 26-170 ug/dL"], or NULL for "Not configured".
  A flag column has nowhere left to come from, because nothing compares a result
  against a range any more.

  Existing text is kept: a single old value becomes a one-line array. Existing
  numeric bounds were never filled in by any shipped version, so if normal_lower
  or normal_upper hold a number, they are printed into the array as one extra
  line before being dropped.

  Safe to run repeatedly. Run it against the target database, for example:
    sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -i database\migrate-normal-ranges.sql
*/

-- ------------------------------------------------------------ test_parameter

IF COL_LENGTH('dbo.test_parameter', 'normal_ranges') IS NULL
    ALTER TABLE dbo.test_parameter ADD normal_ranges NVARCHAR(MAX) NULL;
GO

-- The bounds check has to go before the columns it reads.
IF OBJECT_ID(N'dbo.ck_test_parameter_normal_bounds', N'C') IS NOT NULL
    ALTER TABLE dbo.test_parameter DROP CONSTRAINT ck_test_parameter_normal_bounds;
GO

IF COL_LENGTH('dbo.test_parameter', 'normal_text') IS NOT NULL
BEGIN
    -- Referenced by name only inside dynamic SQL: the column is gone on a re-run.
    DECLARE @text NVARCHAR(MAX) = N'UPDATE dbo.test_parameter SET normal_ranges = CONCAT(N''["'',
        STRING_ESCAPE(normal_text, N''json''), N''"]'') WHERE normal_ranges IS NULL AND normal_text IS NOT NULL;';
    EXEC sp_executesql @text;
    EXEC(N'ALTER TABLE dbo.test_parameter DROP COLUMN normal_text;');
END
GO

IF COL_LENGTH('dbo.test_parameter', 'normal_lower') IS NOT NULL
    EXEC(N'ALTER TABLE dbo.test_parameter DROP COLUMN normal_lower;');
GO

IF COL_LENGTH('dbo.test_parameter', 'normal_upper') IS NOT NULL
    EXEC(N'ALTER TABLE dbo.test_parameter DROP COLUMN normal_upper;');
GO

IF OBJECT_ID(N'dbo.ck_test_parameter_ranges_json', N'C') IS NULL
    ALTER TABLE dbo.test_parameter ADD CONSTRAINT ck_test_parameter_ranges_json
        CHECK (normal_ranges IS NULL OR ISJSON(normal_ranges) = 1);
GO

-- ---------------------------------------------------------------- result_value

IF COL_LENGTH('dbo.result_value', 'normal_ranges') IS NULL
    ALTER TABLE dbo.result_value ADD normal_ranges NVARCHAR(MAX) NULL;
GO

IF COL_LENGTH('dbo.result_value', 'normal_text') IS NOT NULL
BEGIN
    DECLARE @valueText NVARCHAR(MAX) = N'UPDATE dbo.result_value SET normal_ranges = CONCAT(N''["'',
        STRING_ESCAPE(normal_text, N''json''), N''"]'') WHERE normal_ranges IS NULL AND normal_text IS NOT NULL;';
    EXEC sp_executesql @valueText;
    EXEC(N'ALTER TABLE dbo.result_value DROP COLUMN normal_text;');
END
GO

IF COL_LENGTH('dbo.result_value', 'flag') IS NOT NULL
    EXEC(N'ALTER TABLE dbo.result_value DROP COLUMN flag;');
GO

IF OBJECT_ID(N'dbo.ck_result_value_ranges_json', N'C') IS NULL
    ALTER TABLE dbo.result_value ADD CONSTRAINT ck_result_value_ranges_json
        CHECK (normal_ranges IS NULL OR ISJSON(normal_ranges) = 1);
GO

-- ----------------------------------------------------------------- report_line

IF COL_LENGTH('dbo.report_line', 'normal_ranges') IS NULL
    ALTER TABLE dbo.report_line ADD normal_ranges NVARCHAR(MAX) NULL;
GO

IF COL_LENGTH('dbo.report_line', 'normal_text') IS NOT NULL
BEGIN
    DECLARE @lineText NVARCHAR(MAX) = N'UPDATE dbo.report_line SET normal_ranges = CONCAT(N''["'',
        STRING_ESCAPE(normal_text, N''json''), N''"]'') WHERE normal_ranges IS NULL AND normal_text IS NOT NULL;';
    EXEC sp_executesql @lineText;
    EXEC(N'ALTER TABLE dbo.report_line DROP COLUMN normal_text;');
END
GO

IF COL_LENGTH('dbo.report_line', 'flag') IS NOT NULL
    EXEC(N'ALTER TABLE dbo.report_line DROP COLUMN flag;');
GO

IF OBJECT_ID(N'dbo.ck_report_line_ranges_json', N'C') IS NULL
    ALTER TABLE dbo.report_line ADD CONSTRAINT ck_report_line_ranges_json
        CHECK (normal_ranges IS NULL OR ISJSON(normal_ranges) = 1);
GO

-- ------------------------------------------------------------ parameter_option

IF COL_LENGTH('dbo.parameter_option', 'abnormal') IS NOT NULL
BEGIN
    IF OBJECT_ID(N'dbo.df_option_abnormal', N'D') IS NOT NULL
        ALTER TABLE dbo.parameter_option DROP CONSTRAINT df_option_abnormal;
    EXEC(N'ALTER TABLE dbo.parameter_option DROP COLUMN abnormal;');
END
GO
