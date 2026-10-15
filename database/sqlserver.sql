/*
  LabDesk schema for an EXISTING SQL Server database (SQL Server 2016+).
  Used by: dotnet run --project src/LabDesk.Api -- --initialize
  For first-time database creation, use create-local-sqlserver.sql instead.
  Re-running this file leaves existing tables and data intact.

  All metadata, results and report snapshots are JSON payloads in lab_entity.
  parent_id scopes Parameter codes to a Test and Option codes to a Parameter.
  Reference versions use entity_kind='Reference', parent_id=Parameter id and
  code_key='VERSION:<number>'. uq_lab_entity_code therefore enforces BOTH
  code uniqueness within its parent and reference-version uniqueness.
*/

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
