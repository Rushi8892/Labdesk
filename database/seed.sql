/*
  Starter catalog for SQL Server.
  Run schema.sql first. Safe to run repeatedly: if a Test already exists, the
  starter catalog is left untouched. Inserts use generated ids so foreign keys
  in serialized payloads remain correct even when master ids are not 1-based.

  Only the existing starter parameters, types and units are seeded. No reference
  intervals or dropdown options are invented or approved.
*/

SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM dbo.lab_entity WHERE entity_kind = 'Test')
BEGIN
    PRINT 'Starter catalog not inserted: this database already contains tests.';
END
ELSE
BEGIN
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @CategorySeed TABLE (
            Code VARCHAR(20) NOT NULL PRIMARY KEY,
            Name NVARCHAR(100) NOT NULL
        );
        INSERT INTO @CategorySeed (Code, Name) VALUES
            ('HEM', N'Hematology'),
            ('BIO', N'Clinical Chemistry'),
            ('URI', N'Urinalysis'),
            ('MIC', N'Microbiology');

        DECLARE @NewCategoryIds TABLE (Id INT NOT NULL PRIMARY KEY);
        INSERT INTO dbo.lab_entity (entity_kind, parent_id, code_key, is_active, payload)
        OUTPUT inserted.id INTO @NewCategoryIds (Id)
        SELECT 'Category', 0, seed.Code, 1, N'{}'
        FROM @CategorySeed AS seed
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.lab_entity AS existing
            WHERE existing.entity_kind = 'Category' AND existing.parent_id = 0
              AND existing.code_key = seed.Code
        );

        DECLARE @Categories TABLE (
            Code VARCHAR(20) NOT NULL PRIMARY KEY,
            Id INT NOT NULL
        );
        INSERT INTO @Categories (Code, Id)
        SELECT seed.Code, entity.id
        FROM @CategorySeed AS seed
        JOIN dbo.lab_entity AS entity
          ON entity.entity_kind = 'Category'
         AND entity.parent_id = 0
         AND entity.code_key = seed.Code;

        UPDATE entity
        SET payload = (
            SELECT entity.id AS id, seed.Code AS code, seed.Name AS name,
                   entity.is_active AS active
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )
        FROM dbo.lab_entity AS entity
        JOIN @NewCategoryIds AS created ON created.Id = entity.id
        JOIN @CategorySeed AS seed ON seed.Code = entity.code_key;

        DECLARE @SpecimenSeed TABLE (
            Code VARCHAR(20) NOT NULL PRIMARY KEY,
            Name NVARCHAR(100) NOT NULL
        );
        INSERT INTO @SpecimenSeed (Code, Name) VALUES
            ('WB', N'Whole blood'),
            ('SER', N'Serum'),
            ('PL', N'Plasma'),
            ('UR', N'Urine'),
            ('ST', N'Stool');

        DECLARE @NewSpecimenIds TABLE (Id INT NOT NULL PRIMARY KEY);
        INSERT INTO dbo.lab_entity (entity_kind, parent_id, code_key, is_active, payload)
        OUTPUT inserted.id INTO @NewSpecimenIds (Id)
        SELECT 'Specimen', 0, seed.Code, 1, N'{}'
        FROM @SpecimenSeed AS seed
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.lab_entity AS existing
            WHERE existing.entity_kind = 'Specimen' AND existing.parent_id = 0
              AND existing.code_key = seed.Code
        );

        DECLARE @Specimens TABLE (
            Code VARCHAR(20) NOT NULL PRIMARY KEY,
            Id INT NOT NULL
        );
        INSERT INTO @Specimens (Code, Id)
        SELECT seed.Code, entity.id
        FROM @SpecimenSeed AS seed
        JOIN dbo.lab_entity AS entity
          ON entity.entity_kind = 'Specimen'
         AND entity.parent_id = 0
         AND entity.code_key = seed.Code;

        UPDATE entity
        SET payload = (
            SELECT entity.id AS id, seed.Code AS code, seed.Name AS name,
                   entity.is_active AS active
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )
        FROM dbo.lab_entity AS entity
        JOIN @NewSpecimenIds AS created ON created.Id = entity.id
        JOIN @SpecimenSeed AS seed ON seed.Code = entity.code_key;

        DECLARE @TestSeed TABLE (
            Code VARCHAR(30) NOT NULL PRIMARY KEY,
            Name NVARCHAR(160) NOT NULL,
            CategoryCode VARCHAR(20) NOT NULL,
            SpecimenCode VARCHAR(20) NOT NULL,
            DisplayOrder INT NOT NULL
        );
        INSERT INTO @TestSeed (Code, Name, CategoryCode, SpecimenCode, DisplayOrder) VALUES
            ('CBC', N'Complete Blood Count', 'HEM', 'WB', 1),
            ('FBS', N'Fasting Blood Glucose', 'BIO', 'PL', 2),
            ('PPBS', N'Postprandial Blood Glucose', 'BIO', 'PL', 3),
            ('HBA1C', N'HbA1c', 'BIO', 'WB', 4),
            ('LIPID', N'Lipid Profile', 'BIO', 'SER', 5),
            ('LFT', N'Liver Function Test', 'BIO', 'SER', 6),
            ('KFT', N'Kidney Function Test', 'BIO', 'SER', 7),
            ('THYROID', N'Thyroid Profile', 'BIO', 'SER', 8),
            ('URINALYSIS', N'Urinalysis', 'URI', 'UR', 9),
            ('STOOL', N'Stool Routine Examination', 'MIC', 'ST', 10),
            ('ESR', N'ESR', 'HEM', 'WB', 11),
            ('CRP', N'CRP', 'BIO', 'SER', 12);

        DECLARE @NewTestIds TABLE (Id INT NOT NULL PRIMARY KEY);
        INSERT INTO dbo.lab_entity (entity_kind, parent_id, code_key, is_active, payload)
        OUTPUT inserted.id INTO @NewTestIds (Id)
        SELECT 'Test', 0, seed.Code, 1, N'{}'
        FROM @TestSeed AS seed
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.lab_entity AS existing
            WHERE existing.entity_kind = 'Test' AND existing.parent_id = 0
              AND existing.code_key = seed.Code
        );

        DECLARE @Tests TABLE (
            Code VARCHAR(30) NOT NULL PRIMARY KEY,
            Id INT NOT NULL
        );
        INSERT INTO @Tests (Code, Id)
        SELECT seed.Code, entity.id
        FROM @TestSeed AS seed
        JOIN dbo.lab_entity AS entity
          ON entity.entity_kind = 'Test'
         AND entity.parent_id = 0
         AND entity.code_key = seed.Code;

        UPDATE entity
        SET payload = (
            SELECT entity.id AS id,
                   seed.Code AS code,
                   seed.Name AS name,
                   category.Id AS categoryId,
                   specimen.Id AS specimenTypeId,
                   CAST(0.00 AS DECIMAL(10, 2)) AS price,
                   seed.DisplayOrder AS displayOrder,
                   entity.is_active AS active,
                   seed.Name AS reportTitle
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )
        FROM dbo.lab_entity AS entity
        JOIN @NewTestIds AS created ON created.Id = entity.id
        JOIN @TestSeed AS seed ON seed.Code = entity.code_key
        JOIN @Categories AS category ON category.Code = seed.CategoryCode
        JOIN @Specimens AS specimen ON specimen.Code = seed.SpecimenCode;

        DECLARE @ParameterSeed TABLE (
            TestCode VARCHAR(30) NOT NULL,
            Code VARCHAR(30) NOT NULL,
            Name NVARCHAR(160) NOT NULL,
            DataType VARCHAR(20) NOT NULL,
            Unit NVARCHAR(40) NOT NULL,
            DisplayOrder INT NOT NULL,
            PRIMARY KEY (TestCode, Code)
        );
        INSERT INTO @ParameterSeed (TestCode, Code, Name, DataType, Unit, DisplayOrder) VALUES
            ('CBC', 'WBC', 'White blood cell count', 'Numeric', '10^9/L', 1),
            ('CBC', 'RBC', 'Red blood cell count', 'Numeric', '10^12/L', 2),
            ('CBC', 'HGB', 'Hemoglobin', 'Numeric', 'g/dL', 3),
            ('CBC', 'HCT', 'Hematocrit', 'Numeric', '%', 4),
            ('CBC', 'PLT', 'Platelet count', 'Numeric', '10^9/L', 5),
            ('FBS', 'GLU', 'Glucose', 'Numeric', 'mg/dL', 1),
            ('PPBS', 'GLU', 'Glucose', 'Numeric', 'mg/dL', 1),
            ('HBA1C', 'HBA1C', 'Hemoglobin A1c', 'Numeric', '%', 1),
            ('LIPID', 'TC', 'Total cholesterol', 'Numeric', 'mg/dL', 1),
            ('LIPID', 'HDL', 'HDL cholesterol', 'Numeric', 'mg/dL', 2),
            ('LIPID', 'LDL', 'LDL cholesterol', 'Numeric', 'mg/dL', 3),
            ('LIPID', 'TG', 'Triglycerides', 'Numeric', 'mg/dL', 4),
            ('LFT', 'ALT', 'Alanine aminotransferase', 'Numeric', 'U/L', 1),
            ('LFT', 'AST', 'Aspartate aminotransferase', 'Numeric', 'U/L', 2),
            ('LFT', 'ALP', 'Alkaline phosphatase', 'Numeric', 'U/L', 3),
            ('LFT', 'TBIL', 'Total bilirubin', 'Numeric', 'mg/dL', 4),
            ('LFT', 'ALB', 'Albumin', 'Numeric', 'g/dL', 5),
            ('KFT', 'UREA', 'Urea', 'Numeric', 'mg/dL', 1),
            ('KFT', 'CREAT', 'Creatinine', 'Numeric', 'mg/dL', 2),
            ('KFT', 'NA', 'Sodium', 'Numeric', 'mmol/L', 3),
            ('KFT', 'K', 'Potassium', 'Numeric', 'mmol/L', 4),
            ('THYROID', 'TSH', 'Thyroid stimulating hormone', 'Numeric', 'mIU/L', 1),
            ('THYROID', 'T3', 'Triiodothyronine', 'Numeric', 'nmol/L', 2),
            ('THYROID', 'T4', 'Thyroxine', 'Numeric', 'pmol/L', 3),
            ('URINALYSIS', 'COLOR', 'Color', 'Text', '', 1),
            ('URINALYSIS', 'APPEAR', 'Appearance', 'Dropdown', '', 2),
            ('URINALYSIS', 'PH', 'pH', 'Numeric', '', 3),
            ('URINALYSIS', 'PROTEIN', 'Protein', 'Dropdown', '', 4),
            ('URINALYSIS', 'GLUCOSE', 'Glucose', 'Dropdown', '', 5),
            ('URINALYSIS', 'SG', 'Specific gravity', 'Numeric', '', 6),
            ('STOOL', 'COLOR', 'Color', 'Text', '', 1),
            ('STOOL', 'CONSIST', 'Consistency', 'Dropdown', '', 2),
            ('STOOL', 'OCCULT', 'Occult blood', 'Dropdown', '', 3),
            ('STOOL', 'PH', 'pH', 'Numeric', '', 4),
            ('STOOL', 'MICROSCOPY', 'Microscopy', 'Text', '', 5),
            ('ESR', 'ESR', 'Erythrocyte sedimentation rate', 'Numeric', 'mm/hr', 1),
            ('CRP', 'CRP', 'C-reactive protein', 'Numeric', 'mg/L', 1);

        DECLARE @NewParameterIds TABLE (Id INT NOT NULL PRIMARY KEY);
        INSERT INTO dbo.lab_entity (entity_kind, parent_id, code_key, is_active, payload)
        OUTPUT inserted.id INTO @NewParameterIds (Id)
        SELECT 'Parameter', test.Id, seed.Code, 1, N'{}'
        FROM @ParameterSeed AS seed
        JOIN @Tests AS test ON test.Code = seed.TestCode
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.lab_entity AS existing
            WHERE existing.entity_kind = 'Parameter'
              AND existing.parent_id = test.Id
              AND existing.code_key = seed.Code
        );

        UPDATE entity
        SET payload = (
            SELECT entity.id AS id,
                   entity.parent_id AS testId,
                   entity.code_key AS code,
                   seed.Name AS name,
                   seed.DataType AS dataType,
                   seed.Unit AS unit,
                   CASE WHEN seed.DataType = 'Numeric' THEN 2 END AS decimalPlaces,
                   CAST(1 AS BIT) AS required,
                   CAST(0 AS BIT) AS allowNegative,
                   'None' AS referenceType,
                   seed.DisplayOrder AS displayOrder,
                   entity.is_active AS active
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )
        FROM dbo.lab_entity AS entity
        JOIN @NewParameterIds AS created ON created.Id = entity.id
        JOIN @Tests AS test ON test.Id = entity.parent_id
        JOIN @ParameterSeed AS seed
          ON seed.TestCode = test.Code
         AND seed.Code = entity.code_key;

        DECLARE @SeedAudit TABLE (
            EntityName VARCHAR(40) NOT NULL,
            EntityId INT NOT NULL PRIMARY KEY
        );
        INSERT INTO @SeedAudit (EntityName, EntityId)
        SELECT 'Category', Id FROM @NewCategoryIds
        UNION ALL
        SELECT 'Specimen', Id FROM @NewSpecimenIds
        UNION ALL
        SELECT 'Test', Id FROM @NewTestIds
        UNION ALL
        SELECT 'Parameter', Id FROM @NewParameterIds;

        INSERT INTO dbo.lab_audit (entity_name, entity_id, action_name, actor, details)
        SELECT seed.EntityName, seed.EntityId, 'created', 'seed', N'{"seed":true}'
        FROM @SeedAudit AS seed
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.lab_audit AS existing
            WHERE existing.entity_name = seed.EntityName
              AND existing.entity_id = seed.EntityId
              AND existing.action_name = 'created'
              AND existing.actor = 'seed'
              AND existing.details = N'{"seed":true}'
        );

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
