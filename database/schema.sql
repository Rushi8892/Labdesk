/*
  SQL Server schema for LabDesk.
  Connect to the target database before executing this script.

  The laboratory data lives in the real tables created further down this file,
  one per concept, with the relationships enforced by foreign keys. lab_audit
  stores the audit trail.

  lab_entity is the older single-table JSON storage. It is still created here
  because the application still reads it; it goes away with the repository
  switchover, and database/drop-legacy.sql removes it from existing databases.
  No new data belongs in it.

  Safe to run repeatedly: existing tables, rows and indexes are preserved.
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

/* =====================================================================
   Real tables. One table per concept, with foreign keys and unique
   constraints the database enforces itself, replacing the JSON payloads
   in lab_entity. lab_entity is kept until the application is switched
   over and is then removed by database/drop-legacy.sql.

   shortcut: one normal range per parameter, no sex or age bands.
   Male/female hemoglobin and creatinine differences cannot be expressed.
   Upgrade by adding normal_lower_male / normal_upper_male, or by promoting
   the range back to its own table, when a laboratory needs it.

   Every block is existence-checked, so this file can be run repeatedly.
   ===================================================================== */

IF OBJECT_ID(N'dbo.doctor', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.doctor (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_doctor PRIMARY KEY,
        name NVARCHAR(200) NOT NULL,
        -- Deactivated, never deleted: patients reference this row.
        active BIT NOT NULL CONSTRAINT df_doctor_active DEFAULT 1
    );
END
GO

IF OBJECT_ID(N'dbo.category', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.category (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_category PRIMARY KEY,
        code VARCHAR(40) NOT NULL CONSTRAINT uq_category_code UNIQUE,
        name NVARCHAR(200) NOT NULL,
        active BIT NOT NULL CONSTRAINT df_category_active DEFAULT 1
    );
END
GO

IF OBJECT_ID(N'dbo.specimen', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.specimen (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_specimen PRIMARY KEY,
        code VARCHAR(40) NOT NULL CONSTRAINT uq_specimen_code UNIQUE,
        name NVARCHAR(200) NOT NULL,
        active BIT NOT NULL CONSTRAINT df_specimen_active DEFAULT 1
    );
END
GO

IF OBJECT_ID(N'dbo.method', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.method (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_method PRIMARY KEY,
        code VARCHAR(40) NOT NULL CONSTRAINT uq_method_code UNIQUE,
        name NVARCHAR(200) NOT NULL,
        active BIT NOT NULL CONSTRAINT df_method_active DEFAULT 1
    );
END
GO

IF OBJECT_ID(N'dbo.patient', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.patient (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_patient PRIMARY KEY,
        name NVARCHAR(200) NOT NULL,
        -- Years, with fractions allowed so infants can be recorded.
        age DECIMAL(5,2) NOT NULL,
        sex VARCHAR(10) NOT NULL,
        phone VARCHAR(30) NULL,
        doctor_id INT NULL,
        -- Deactivated, never deleted: results reference this row.
        active BIT NOT NULL CONSTRAINT df_patient_active DEFAULT 1,
        created_at DATETIME2 NOT NULL CONSTRAINT df_patient_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT fk_patient_doctor FOREIGN KEY (doctor_id) REFERENCES dbo.doctor(id),
        CONSTRAINT ck_patient_sex CHECK (sex IN ('Male', 'Female', 'Other'))
    );
END
GO

IF OBJECT_ID(N'dbo.test', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.test (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_test PRIMARY KEY,
        code VARCHAR(40) NOT NULL CONSTRAINT uq_test_code UNIQUE,
        name NVARCHAR(200) NOT NULL,
        short_name NVARCHAR(60) NULL,
        category_id INT NULL,
        specimen_id INT NULL,
        method_id INT NULL,
        description NVARCHAR(1000) NULL,
        patient_preparation NVARCHAR(1000) NULL,
        collection_instructions NVARCHAR(1000) NULL,
        container NVARCHAR(200) NULL,
        minimum_sample NVARCHAR(200) NULL,
        turnaround_time NVARCHAR(100) NULL,
        report_title NVARCHAR(200) NULL,
        notes NVARCHAR(1000) NULL,
        display_order INT NOT NULL CONSTRAINT df_test_order DEFAULT 0,
        active BIT NOT NULL CONSTRAINT df_test_active DEFAULT 1,
        CONSTRAINT fk_test_category FOREIGN KEY (category_id) REFERENCES dbo.category(id),
        CONSTRAINT fk_test_specimen FOREIGN KEY (specimen_id) REFERENCES dbo.specimen(id),
        CONSTRAINT fk_test_method FOREIGN KEY (method_id) REFERENCES dbo.method(id)
    );
END
GO

IF OBJECT_ID(N'dbo.test_parameter', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.test_parameter (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_test_parameter PRIMARY KEY,
        test_id INT NOT NULL,
        code VARCHAR(40) NOT NULL,
        name NVARCHAR(200) NOT NULL,
        data_type VARCHAR(20) NOT NULL,
        unit NVARCHAR(40) NULL,
        result_format NVARCHAR(40) NULL,
        decimal_places INT NULL,
        required BIT NOT NULL CONSTRAINT df_parameter_required DEFAULT 0,
        allow_negative BIT NOT NULL CONSTRAINT df_parameter_allow_negative DEFAULT 0,
        technical_min DECIMAL(18,4) NULL,
        technical_max DECIMAL(18,4) NULL,
        -- The parameter's one normal range. NULL means "Not configured".
        normal_lower DECIMAL(18,4) NULL,
        normal_upper DECIMAL(18,4) NULL,
        normal_text NVARCHAR(200) NULL,
        display_order INT NOT NULL CONSTRAINT df_parameter_order DEFAULT 0,
        active BIT NOT NULL CONSTRAINT df_parameter_active DEFAULT 1,
        notes NVARCHAR(1000) NULL,
        CONSTRAINT uq_test_parameter_test_code UNIQUE (test_id, code),
        CONSTRAINT fk_test_parameter_test FOREIGN KEY (test_id) REFERENCES dbo.test(id),
        CONSTRAINT ck_test_parameter_normal_bounds
            CHECK (normal_lower IS NULL OR normal_upper IS NULL OR normal_lower <= normal_upper),
        CONSTRAINT ck_test_parameter_data_type
            CHECK (data_type IN ('Numeric', 'Text', 'Dropdown', 'Boolean', 'Date'))
    );
END
GO

IF OBJECT_ID(N'dbo.parameter_option', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.parameter_option (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_parameter_option PRIMARY KEY,
        parameter_id INT NOT NULL,
        code VARCHAR(40) NOT NULL,
        label NVARCHAR(200) NOT NULL,
        sort_order INT NOT NULL CONSTRAINT df_option_order DEFAULT 0,
        abnormal BIT NOT NULL CONSTRAINT df_option_abnormal DEFAULT 0,
        active BIT NOT NULL CONSTRAINT df_option_active DEFAULT 1,
        CONSTRAINT uq_parameter_option_parameter_code UNIQUE (parameter_id, code),
        CONSTRAINT fk_parameter_option_parameter
            FOREIGN KEY (parameter_id) REFERENCES dbo.test_parameter(id)
    );
END
GO

IF OBJECT_ID(N'dbo.lab_result', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.lab_result (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_lab_result PRIMARY KEY,
        patient_id INT NOT NULL,
        test_id INT NOT NULL,
        collected_at DATETIME2 NOT NULL,
        status VARCHAR(20) NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT df_result_created DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT df_result_updated DEFAULT SYSUTCDATETIME(),
        completed_at DATETIME2 NULL,
        CONSTRAINT fk_lab_result_patient FOREIGN KEY (patient_id) REFERENCES dbo.patient(id),
        CONSTRAINT fk_lab_result_test FOREIGN KEY (test_id) REFERENCES dbo.test(id),
        CONSTRAINT ck_lab_result_status CHECK (status IN ('Draft', 'Completed'))
    );
END
GO

IF OBJECT_ID(N'dbo.result_value', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.result_value (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_result_value PRIMARY KEY,
        result_id INT NOT NULL,
        parameter_id INT NOT NULL,
        value NVARCHAR(200) NULL,
        flag VARCHAR(20) NULL,
        -- The range text as evaluated for this value.
        normal_text NVARCHAR(200) NULL,
        CONSTRAINT uq_result_value_result_parameter UNIQUE (result_id, parameter_id),
        CONSTRAINT fk_result_value_result FOREIGN KEY (result_id)
            REFERENCES dbo.lab_result(id) ON DELETE CASCADE,
        CONSTRAINT fk_result_value_parameter FOREIGN KEY (parameter_id)
            REFERENCES dbo.test_parameter(id)
    );
END
GO

IF OBJECT_ID(N'dbo.report_snapshot', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.report_snapshot (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_report_snapshot PRIMARY KEY,
        result_id INT NOT NULL,
        report_title NVARCHAR(200) NULL,
        test_name NVARCHAR(200) NOT NULL,
        test_code VARCHAR(40) NOT NULL,
        patient_name NVARCHAR(200) NOT NULL,
        age DECIMAL(5,2) NOT NULL,
        sex VARCHAR(10) NOT NULL,
        -- Frozen when the report is completed, so later edits to the patient
        -- or the doctor cannot rewrite a report that was already printed.
        doctor_name NVARCHAR(200) NULL,
        collected_at DATETIME2 NOT NULL,
        completed_at DATETIME2 NOT NULL,
        CONSTRAINT uq_report_snapshot_result UNIQUE (result_id),
        CONSTRAINT fk_report_snapshot_result FOREIGN KEY (result_id)
            REFERENCES dbo.lab_result(id)
    );
END
GO

IF OBJECT_ID(N'dbo.report_line', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.report_line (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_report_line PRIMARY KEY,
        snapshot_id INT NOT NULL,
        name NVARCHAR(200) NOT NULL,
        code VARCHAR(40) NOT NULL,
        unit NVARCHAR(40) NULL,
        value NVARCHAR(200) NULL,
        normal_text NVARCHAR(200) NULL,
        flag VARCHAR(20) NULL,
        option_label NVARCHAR(200) NULL,
        display_order INT NOT NULL CONSTRAINT df_report_line_order DEFAULT 0,
        CONSTRAINT fk_report_line_snapshot FOREIGN KEY (snapshot_id)
            REFERENCES dbo.report_snapshot(id) ON DELETE CASCADE
    );
END
GO
