/*
  Starter catalog for SQL Server.
  Run schema.sql first. Safe to run repeatedly: if a Test already exists, the
  starter catalog is left untouched.

  Only the existing starter categories, specimens, tests, parameters, types and
  units are seeded. No normal ranges and no dropdown options are invented or
  approved: every normal_lower, normal_upper and normal_text stays NULL until the
  laboratory enters and approves its own ranges.
*/

SET XACT_ABORT ON;

IF EXISTS (SELECT 1 FROM dbo.test)
BEGIN
    PRINT 'Starter catalog not inserted: this database already contains tests.';
END
ELSE
BEGIN
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @CategorySeed TABLE (
            Code VARCHAR(40) NOT NULL PRIMARY KEY,
            Name NVARCHAR(200) NOT NULL
        );
        INSERT INTO @CategorySeed (Code, Name) VALUES
            ('HEM', N'Hematology'),
            ('BIO', N'Clinical Chemistry'),
            ('URI', N'Urinalysis'),
            ('MIC', N'Microbiology');

        DECLARE @NewCategoryIds TABLE (Id INT NOT NULL PRIMARY KEY);
        INSERT INTO dbo.category (code, name)
        OUTPUT inserted.id INTO @NewCategoryIds (Id)
        SELECT seed.Code, seed.Name
        FROM @CategorySeed AS seed
        WHERE NOT EXISTS (SELECT 1 FROM dbo.category AS existing WHERE existing.code = seed.Code);

        DECLARE @SpecimenSeed TABLE (
            Code VARCHAR(40) NOT NULL PRIMARY KEY,
            Name NVARCHAR(200) NOT NULL
        );
        INSERT INTO @SpecimenSeed (Code, Name) VALUES
            ('WB', N'Whole blood'),
            ('SER', N'Serum'),
            ('PL', N'Plasma'),
            ('UR', N'Urine'),
            ('ST', N'Stool');

        DECLARE @NewSpecimenIds TABLE (Id INT NOT NULL PRIMARY KEY);
        INSERT INTO dbo.specimen (code, name)
        OUTPUT inserted.id INTO @NewSpecimenIds (Id)
        SELECT seed.Code, seed.Name
        FROM @SpecimenSeed AS seed
        WHERE NOT EXISTS (SELECT 1 FROM dbo.specimen AS existing WHERE existing.code = seed.Code);

        DECLARE @TestSeed TABLE (
            Code VARCHAR(40) NOT NULL PRIMARY KEY,
            Name NVARCHAR(200) NOT NULL,
            CategoryCode VARCHAR(40) NOT NULL,
            SpecimenCode VARCHAR(40) NOT NULL,
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
        INSERT INTO dbo.test (code, name, category_id, specimen_id, display_order, report_title)
        OUTPUT inserted.id INTO @NewTestIds (Id)
        SELECT seed.Code, seed.Name, category.id, specimen.id, seed.DisplayOrder, seed.Name
        FROM @TestSeed AS seed
        LEFT JOIN dbo.category AS category ON category.code = seed.CategoryCode
        LEFT JOIN dbo.specimen AS specimen ON specimen.code = seed.SpecimenCode
        WHERE NOT EXISTS (SELECT 1 FROM dbo.test AS existing WHERE existing.code = seed.Code);

        DECLARE @ParameterSeed TABLE (
            TestCode VARCHAR(40) NOT NULL,
            Code VARCHAR(40) NOT NULL,
            Name NVARCHAR(200) NOT NULL,
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
        INSERT INTO dbo.test_parameter
            (test_id, code, name, data_type, unit, decimal_places, required, allow_negative, display_order)
        OUTPUT inserted.id INTO @NewParameterIds (Id)
        SELECT test.id, seed.Code, seed.Name, seed.DataType, NULLIF(seed.Unit, N''),
            CASE WHEN seed.DataType = 'Numeric' THEN 2 END, 1, 0, seed.DisplayOrder
        FROM @ParameterSeed AS seed
        JOIN dbo.test AS test ON test.code = seed.TestCode
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.test_parameter AS existing
            WHERE existing.test_id = test.id AND existing.code = seed.Code
        );

        -- The starter catalog is attributed to 'seed', exactly as before, so the
        -- audit page shows where the catalog came from.
        DECLARE @SeedAudit TABLE (
            EntityName VARCHAR(80) NOT NULL,
            EntityId INT NOT NULL,
            -- Ids come from separate tables now, so they overlap between kinds;
            -- the key has to be the pair, not the id alone.
            PRIMARY KEY (EntityName, EntityId)
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
        FROM @SeedAudit AS seed;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
