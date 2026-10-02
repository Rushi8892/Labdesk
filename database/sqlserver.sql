IF OBJECT_ID('lab_entity','U') IS NULL
CREATE TABLE lab_entity (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    entity_kind VARCHAR(40) NOT NULL,
    parent_id INT NOT NULL CONSTRAINT df_lab_entity_parent DEFAULT 0,
    code_key VARCHAR(255) NULL,
    is_active BIT NOT NULL CONSTRAINT df_lab_entity_active DEFAULT 1,
    payload NVARCHAR(MAX) NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_lab_entity_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_lab_entity_updated DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='uq_lab_entity_code' AND object_id=OBJECT_ID('lab_entity'))
CREATE UNIQUE INDEX uq_lab_entity_code ON lab_entity(entity_kind,parent_id,code_key) WHERE code_key IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_lab_entity_parent' AND object_id=OBJECT_ID('lab_entity'))
CREATE INDEX ix_lab_entity_parent ON lab_entity(entity_kind,parent_id);
GO
IF OBJECT_ID('lab_audit','U') IS NULL
CREATE TABLE lab_audit (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    entity_name VARCHAR(80) NOT NULL,
    entity_id INT NOT NULL,
    action_name VARCHAR(40) NOT NULL,
    actor VARCHAR(200) NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_lab_audit_created DEFAULT SYSUTCDATETIME(),
    details NVARCHAR(MAX) NOT NULL
);
GO