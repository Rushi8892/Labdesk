/*
  First-time local SQL Server / LocalDB setup.
  Run the WHOLE file in SQL Server Management Studio or with sqlcmd.
  No SQLCMD mode, :r includes or external files are required.
  Safe to run repeatedly: existing data is never deleted or reseeded.
  Then run the API --initialize command to seed the unchanged starter catalog.

  The schema below is identical to sqlserver.sql.
*/

USE [master];
GO

IF DB_ID(N'PathologyTests') IS NULL
BEGIN
    CREATE DATABASE [PathologyTests];
END
GO

USE [PathologyTests];
GO

IF OBJECT_ID(N'dbo.lab_entity', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.lab_entity (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_lab_entity PRIMARY KEY,
        entity_kind VARCHAR(40) NOT NULL,
        parent_id INT NOT NULL CONSTRAINT df_lab_entity_parent DEFAULT 0,
        code_key VARCHAR(255) NULL,
        is_active BIT NOT NULL CONSTRAINT df_lab_entity_active DEFAULT 1,
        payload NVARCHAR(MAX) NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT df_lab_entity_created DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT df_lab_entity_updated DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Also enforces Reference version uniqueness via code_key='VERSION:<number>'.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'uq_lab_entity_code' AND object_id = OBJECT_ID(N'dbo.lab_entity')
)
BEGIN
    CREATE UNIQUE INDEX uq_lab_entity_code
        ON dbo.lab_entity(entity_kind, parent_id, code_key)
        WHERE code_key IS NOT NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'ix_lab_entity_parent' AND object_id = OBJECT_ID(N'dbo.lab_entity')
)
BEGIN
    CREATE INDEX ix_lab_entity_parent ON dbo.lab_entity(entity_kind, parent_id);
END
GO

IF OBJECT_ID(N'dbo.lab_audit', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.lab_audit (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_lab_audit PRIMARY KEY,
        entity_name VARCHAR(80) NOT NULL,
        entity_id INT NOT NULL,
        action_name VARCHAR(40) NOT NULL,
        actor VARCHAR(200) NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT df_lab_audit_created DEFAULT SYSUTCDATETIME(),
        details NVARCHAR(MAX) NOT NULL
    );
END
GO
