/* =====================================================================
   Master test menu: the lab's own catalogue.

   Source: lab_tests_parameters.pdf (31 tests) + Dengue + CBC details.
   This file is the authority for the catalogue, so it is safe to re-run:
   it inserts what is missing and rewrites names, units, reference ranges
   and dropdown options in place.

   Rows that are no longer in this list are removed when nothing recorded
   a value against them. When a result already references them they are
   kept, so old reports still render, but switched inactive so they stop
   being offered at result entry.

   Run after schema.sql and seed.sql:
       sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -i database/seed-menu.sql
   ===================================================================== */
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @Tests TABLE
(
    Code VARCHAR(40) NOT NULL PRIMARY KEY,
    Name NVARCHAR(200) NOT NULL,
    CategoryCode VARCHAR(40) NOT NULL,
    SpecimenCode VARCHAR(40) NOT NULL,
    DisplayOrder INT NOT NULL,
    Notes NVARCHAR(1000) NULL
);

INSERT INTO @Tests (Code, Name, CategoryCode, SpecimenCode, DisplayOrder, Notes) VALUES
    ('KFT',     N'Kidney Profile',                                        'BIO',      'SER', 10,  NULL),
    ('LFT',     N'Liver Function Profile',                                'BIO',      'SER', 20,  NULL),
    ('CBC',     N'Complete Blood Count (CBC)',                            'HEM',      'WB',  30,  NULL),
    ('FBS',     N'Fasting Blood Sugar (FBS)',                             'BIO',      'PL',  40,  NULL),
    ('PPBS',    N'Post Prandial Blood Sugar (PPBS)',                      'BIO',      'PL',  50,  NULL),
    ('RBSL',    N'Random Blood Sugar (RBS)',                              'BIO',      'PL',  60,  NULL),
    ('HBA1C',   N'Glycosylated Hemoglobin (HbA1c)',                       'BIO',      'WB',  70,  NULL),
    ('THYROID', N'Thyroid Function Test',                                 'BIO',      'SER', 80,  NULL),
    ('VB12',    N'Vitamin B12',                                           'BIO',      'SER', 90,  NULL),
    ('VITD',    N'Vitamin D',                                             'BIO',      'SER', 100, NULL),
    ('CALCIUM', N'Calcium',                                               'BIO',      'SER', 110, NULL),
    ('LIPID',   N'Lipid Profile',                                         'BIO',      'SER', 120, NULL),
    ('IRON',    N'Iron Profile',                                          'BIO',      'SER', 130, NULL),
    ('BLGRP',   N'Blood Group',                                           'HEM',      'WB',  140, NULL),
    ('CHIKV',   N'Chikungunya IgM / IgG',                                 'SEROLOGY', 'SER', 150, NULL),
    ('LEPTO',   N'Leptospira IgM',                                        'SEROLOGY', 'SER', 160, NULL),
    ('MALARIA', N'Malaria Pf / Pv',                                       'SEROLOGY', 'SER', 170, NULL),
    ('ICT',     N'ICT',                                                   'SEROLOGY', 'SER', 180, NULL),
    ('HIV',     N'HIV',                                                   'SEROLOGY', 'SER', 190, NULL),
    ('VDRL',    N'VDRL',                                                  'SEROLOGY', 'SER', 200, NULL),
    ('UPT',     N'Urine Pregnancy Test',                                  'SEROLOGY', 'UR',  210, NULL),
    ('HBSAG',   N'HBsAg',                                                 'SEROLOGY', 'SER', 220, NULL),
    ('HCV',     N'Anti-HCV',                                              'SEROLOGY', 'SER', 230, NULL),
    ('HAV',     N'HAV IgM',                                               'SEROLOGY', 'SER', 240, NULL),
    ('HEV',     N'HEV IgM',                                               'SEROLOGY', 'SER', 250, NULL),
    ('AMYLASE', N'Serum Amylase',                                         'BIO',      'SER', 260, NULL),
    ('LIPASE',  N'Serum Lipase',                                          'BIO',      'SER', 270, NULL),
    ('CKMB',    N'Creatine Kinase-MB (CK-MB)',                            'BIO',      'SER', 280, NULL),
    ('TROPI',   N'Troponin-I',                                            'BIO',      'SER', 290, NULL),
    ('BTCT',    N'Bleeding Time - Clotting Time',                         'HEM',      'WB',  300, N'BT by Duke method. CT by capillary method; both are method-dependent.'),
    ('PTINR',   N'Prothrombin Time - International Normalized Ratio',     'HEM',      'PL',  310, NULL),
    ('DENGUE',  N'Dengue',                                                'SEROLOGY', 'SER', 320, NULL);

DECLARE @Params TABLE
(
    TestCode VARCHAR(40) NOT NULL,
    Code VARCHAR(40) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    DataType VARCHAR(20) NOT NULL,
    Unit NVARCHAR(40) NULL,
    Ranges NVARCHAR(MAX) NULL,
    DisplayOrder INT NOT NULL,
    Notes NVARCHAR(1000) NULL,
    PRIMARY KEY (TestCode, Code)
);

INSERT INTO @Params (TestCode, Code, Name, DataType, Unit, Ranges, DisplayOrder, Notes) VALUES
    -- Kidney Profile
    ('KFT', 'UREA',  N'Blood Urea',                                     'Numeric', N'mg/dL',      N'["15 - 45"]',   10, NULL),
    ('KFT', 'BUN',   N'Blood Urea Nitrogen',                            'Numeric', N'mg/dL',      N'["0.8 - 45.0"]', 20, NULL),
    ('KFT', 'CREAT', N'Serum Creatinine',                               'Numeric', N'mg/dL',      N'["0.7 - 1.4"]', 30, NULL),
    ('KFT', 'BUNC',  N'Blood Urea Nitrogen / Creatinine Ratio',         'Numeric', N'ratio',      N'["8 - 20"]',    40, NULL),
    ('KFT', 'NA',    N'Sodium',                                         'Numeric', N'mmol/L',     N'["135 - 145"]', 50, NULL),
    ('KFT', 'K',     N'Potassium',                                      'Numeric', N'mmol/L',     N'["3.5 - 5.5"]', 60, NULL),
    ('KFT', 'CL',    N'S. Chloride',                                    'Numeric', N'mmol/L',     N'["98 - 107"]',  70, NULL),
    ('KFT', 'URIC',  N'Serum Uric Acid',                                'Numeric', N'mg/dL',      N'["3.4 - 7.0"]', 80, NULL),
    -- Liver Function Profile
    ('LFT', 'TBIL',  N'Total Bilirubin',                                'Numeric', N'mg/dL',      N'["0.1 - 1.0"]', 10, NULL),
    ('LFT', 'DBIL',  N'Direct Bilirubin',                               'Numeric', N'mg/dL',      N'["0.0 - 0.3"]', 20, NULL),
    ('LFT', 'IBIL',  N'Indirect Bilirubin',                             'Numeric', N'mg/dL',      N'["0.1 - 1.0"]', 30, NULL),
    ('LFT', 'AST',   N'S.G.O.T (AST)',                                  'Numeric', N'U/L',        N'["0 - 35"]',    40, NULL),
    ('LFT', 'ALT',   N'S.G.P.T (ALT)',                                  'Numeric', N'U/L',        N'["0 - 45"]',    50, NULL),
    ('LFT', 'ALP',   N'S. Alk. Phosphatase',                            'Numeric', N'U/L',        N'["50 - 306"]',  60, NULL),
    ('LFT', 'TP',    N'Protein Total',                                  'Numeric', N'g/dL',       N'["6.0 - 8.3"]', 70, NULL),
    ('LFT', 'ALB',   N'Albumin',                                        'Numeric', N'g/dL',       N'["3.5 - 4.5"]', 80, NULL),
    ('LFT', 'GLB',   N'Globulin',                                       'Numeric', N'g/dL',       N'["2.4 - 4.4"]', 90, NULL),
    ('LFT', 'AGR',   N'Albumin / Globulin Ratio',                       'Numeric', N'ratio',      N'["2.3 - 3.5"]', 100, NULL),
    -- Complete Blood Count
    ('CBC', 'HGB',   N'Hemoglobin',                                     'Numeric', N'g/dL',        N'["12.0 - 15.0"]',   10,  NULL),
    ('CBC', 'WBC',   N'WBC (Total Leucocyte Count)',                    'Numeric', N'cells/cumm',  N'["4000 - 10000"]',  20,  NULL),
    ('CBC', 'RBC',   N'RBC',                                            'Numeric', N'million/cumm',N'["3.8 - 4.8"]',     30,  NULL),
    ('CBC', 'HCT',   N'Packed Cell Volume (PCV)',                       'Numeric', N'%',           N'["36 - 46"]',       40,  NULL),
    ('CBC', 'MCV',   N'MCV',                                            'Numeric', N'fL',          N'["83 - 101"]',      50,  NULL),
    ('CBC', 'MCH',   N'MCH',                                            'Numeric', N'pg',          N'["27 - 32"]',       60,  NULL),
    ('CBC', 'MCHC',  N'MCHC',                                           'Numeric', N'g/dL',        N'["31.5 - 34.5"]',   70,  NULL),
    ('CBC', 'NEUT',  N'Neutrophils',                                    'Numeric', N'%',           N'["40 - 80"]',       80,  NULL),
    ('CBC', 'LYMPH', N'Lymphocytes',                                    'Numeric', N'%',           N'["20 - 40"]',       90,  NULL),
    ('CBC', 'EOS',   N'Eosinophils',                                    'Numeric', N'%',           N'["1 - 6"]',         100, NULL),
    ('CBC', 'MONO',  N'Monocytes',                                      'Numeric', N'%',           N'["2 - 10"]',        110, NULL),
    ('CBC', 'BASO',  N'Basophils',                                      'Numeric', N'%',           N'["0 - 1"]',         120, NULL),
    ('CBC', 'PLT',   N'Platelet Count',                                 'Numeric', N'lakhs/cumm',  N'["1.5 - 4.1"]',     130, NULL),
    -- Blood sugars
    ('FBS',  'GLU',  N'Fasting Blood Sugar',                            'Numeric', N'mg/dL',      N'["70 - 110"]',  10, NULL),
    ('PPBS', 'GLU',  N'Post Prandial Blood Sugar',                      'Numeric', N'mg/dL',      N'["140 - 180"]', 10, NULL),
    ('RBSL', 'GLU',  N'Random Blood Sugar',                             'Numeric', N'mg/dL',      N'["140 - 199"]', 10, NULL),
    -- HbA1c
    ('HBA1C', 'HBA1C', N'Hemoglobin A1c (HbA1c)',                       'Numeric', N'%',          N'["< 5.7"]',     10, NULL),
    ('HBA1C', 'EAG',   N'Estimated Average Glucose (eAG)',              'Numeric', N'mg/dL',      N'["< 150"]',     20, NULL),
    -- Thyroid Function Test
    ('THYROID', 'T3',  N'Triiodothyronine Total (TT3)',                 'Numeric', N'ng/dL',      N'["60 - 200"]',    10, NULL),
    ('THYROID', 'T4',  N'Thyroxine - Total (TT4)',                      'Numeric', N'µg/dL',      N'["4.6 - 12.5"]',  20, NULL),
    ('THYROID', 'TSH', N'Thyroid Stimulating Hormone (TSH)',            'Numeric', N'µIU/mL',     N'["0.38 - 5.33"]', 30, NULL),
    -- Vitamins and minerals
    ('VB12',    'B12',  N'Vitamin B12',                                 'Numeric', N'pg/mL',      N'["200 - 900"]',  10, NULL),
    ('VITD',    'VD',   N'25-OH Vitamin D',                             'Numeric', N'ng/mL',      N'["< 20"]',       10, NULL),
    ('CALCIUM', 'CALC', N'Serum Calcium',                               'Numeric', N'mg/dL',      N'["8.5 - 10.5"]', 10, NULL),
    -- Lipid Profile
    ('LIPID', 'TC',    N'Cholesterol - Total',                          'Numeric', N'mg/dL',      N'["150 - 250"]',  10, NULL),
    ('LIPID', 'HDL',   N'Cholesterol - HDL',                            'Numeric', N'mg/dL',      N'["30 - 60"]',    20, NULL),
    ('LIPID', 'TG',    N'Triglycerides',                                'Numeric', N'mg/dL',      N'["60 - 160"]',   30, NULL),
    ('LIPID', 'LDL',   N'Cholesterol - LDL',                            'Numeric', N'mg/dL',      N'["60 - 185"]',   40, NULL),
    ('LIPID', 'VLDL',  N'Cholesterol - VLDL',                           'Numeric', N'mg/dL',      N'["5 - 40"]',     50, NULL),
    ('LIPID', 'CHDL',  N'Total Cholesterol / HDL Ratio',                'Numeric', N'ratio',      N'["0 - 5.0"]',    60, NULL),
    ('LIPID', 'LDHDL', N'LDL / HDL Ratio',                              'Numeric', N'ratio',      N'["2.5 - 3.5"]',  70, NULL),
    -- Iron Profile
    ('IRON', 'IRON',   N'Iron',                                         'Numeric', N'µg/dL',      N'["33 - 193"]',   10, NULL),
    ('IRON', 'TIBC',   N'Iron Binding Capacity - Total (TIBC)',         'Numeric', N'µg/dL',      N'["240 - 450"]',  20, NULL),
    ('IRON', 'TRANSF', N'Transferrin',                                  'Numeric', N'µg/dL',      N'["176 - 280"]',  30, NULL),
    ('IRON', 'TSAT',   N'Transferrin Saturation',                       'Numeric', N'%',           N'["20 - 50"]',    40, NULL),
    -- Blood group
    ('BLGRP', 'BG', N'Blood Group',                                     'Dropdown', NULL,         NULL,              10, NULL),
    -- Serology
    ('CHIKV',   'CHIKV',  N'Chikungunya IgM',                           'Dropdown', NULL,         N'["Negative"]',    10, NULL),
    ('CHIKV',   'CHIKVG', N'Chikungunya IgG',                           'Dropdown', NULL,         N'["Negative"]',    20, NULL),
    ('LEPTO',   'LEPTO',  N'Leptospira IgM',                            'Dropdown', NULL,         N'["Negative"]',    10, NULL),
    ('MALARIA', 'MPF',    N'Malaria Pf (P. falciparum)',                'Dropdown', NULL,         N'["Negative"]',    10, NULL),
    ('MALARIA', 'MPV',    N'Malaria Pv (P. vivax)',                     'Dropdown', NULL,         N'["Negative"]',    20, NULL),
    ('ICT',     'ICT',    N'ICT',                                       'Dropdown', NULL,         N'["Negative"]',    10, NULL),
    ('HIV',     'HIV',    N'HIV I & II Antibodies',                     'Dropdown', NULL,         N'["Non-reactive"]', 10, NULL),
    ('VDRL',    'VDRL',   N'VDRL (RPR)',                                'Dropdown', NULL,         N'["Non-reactive"]', 10, NULL),
    ('UPT',     'UPT',    N'Urine Pregnancy Test',                      'Dropdown', NULL,         N'["Negative"]',    10, NULL),
    ('HBSAG',   'HBSAG',  N'HBsAg',                                     'Dropdown', NULL,         N'["Non-reactive"]', 10, NULL),
    ('HCV',     'HCV',    N'Anti-HCV',                                  'Dropdown', NULL,         N'["Non-reactive"]', 10, NULL),
    ('HAV',     'HAV',    N'HAV IgM',                                   'Dropdown', NULL,         N'["Negative"]',    10, NULL),
    ('HEV',     'HEV',    N'HEV IgM',                                   'Dropdown', NULL,         N'["Negative"]',    10, NULL),
    -- Enzymes and cardiac markers
    ('AMYLASE', 'AMY',   N'Serum Amylase',                              'Numeric', N'U/L',        N'["30 - 110"]',   10, NULL),
    ('LIPASE',  'LIP',   N'Serum Lipase',                               'Numeric', N'U/L',        N'["13 - 60"]',    10, NULL),
    ('CKMB',    'CKMB',  N'CK-MB',                                      'Numeric', N'ng/mL',      N'["0 - 5"]',      10, NULL),
    ('TROPI',   'TROPI', N'Troponin-I',                                 'Numeric', N'ng/mL',      N'["< 0.04"]',     10, NULL),
    -- Coagulation
    ('BTCT',  'BT',  N'Bleeding Time (BT)',                             'Numeric', N'minutes',    N'["2 min 50 sec - 5 min 30 sec"]', 10, N'Duke method.'),
    ('BTCT',  'CT',  N'Clotting Time (CT)',                             'Numeric', N'minutes',    N'["3 - 8"]',       20, N'Capillary method; method-dependent.'),
    ('PTINR', 'PT',  N'Prothrombin Time (PT)',                          'Numeric', N'seconds',    N'["11 - 13"]',     10, NULL),
    ('PTINR', 'INR', N'INR',                                            'Numeric', N'ratio',      N'["0.9 - 1.1"]',   20, N'Reference applies to people not taking anticoagulants.'),
    -- Dengue
    ('DENGUE', 'NS1', N'NS1 Antigen',                                   'Dropdown', NULL,         N'["Negative"]',    10, NULL),
    ('DENGUE', 'IGG', N'IgG Antibody',                                  'Dropdown', NULL,         N'["Negative"]',    20, NULL),
    ('DENGUE', 'IGM', N'IgM Antibody',                                  'Dropdown', NULL,         N'["Negative"]',    30, NULL);

DECLARE @Options TABLE
(
    TestCode VARCHAR(40) NOT NULL,
    ParamCode VARCHAR(40) NOT NULL,
    Code VARCHAR(20) NOT NULL,
    Label NVARCHAR(100) NOT NULL,
    SortOrder INT NOT NULL,
    PRIMARY KEY (TestCode, ParamCode, Code)
);

INSERT INTO @Options (TestCode, ParamCode, Code, Label, SortOrder) VALUES
    ('BLGRP', 'BG', 'ARHP',  N'A RH POSITIVE', 10),
    ('BLGRP', 'BG', 'ARHN',  N'A RH NEGATIVE', 20),
    ('BLGRP', 'BG', 'BRHP',  N'B RH POSITIVE', 30),
    ('BLGRP', 'BG', 'BRHN',  N'B RH NEGATIVE', 40),
    ('BLGRP', 'BG', 'ABRHP', N'AB RH POSITIVE', 50),
    ('BLGRP', 'BG', 'ABRHN', N'AB RH NEGATIVE', 60),
    ('BLGRP', 'BG', 'ORHP',  N'O RH POSITIVE', 70),
    ('BLGRP', 'BG', 'ORHN',  N'O RH NEGATIVE', 80),
    ('CHIKV',   'CHIKV',  'NEG', N'Negative', 10),
    ('CHIKV',   'CHIKV',  'POS', N'Positive', 20),
    ('CHIKV',   'CHIKVG', 'NEG', N'Negative', 10),
    ('CHIKV',   'CHIKVG', 'POS', N'Positive', 20),
    ('LEPTO',   'LEPTO',  'NEG', N'Negative', 10),
    ('LEPTO',   'LEPTO',  'POS', N'Positive', 20),
    ('MALARIA', 'MPF',    'NEG', N'Negative', 10),
    ('MALARIA', 'MPF',    'POS', N'Positive', 20),
    ('MALARIA', 'MPV',    'NEG', N'Negative', 10),
    ('MALARIA', 'MPV',    'POS', N'Positive', 20),
    ('ICT',     'ICT',    'NEG', N'Negative', 10),
    ('ICT',     'ICT',    'POS', N'Positive', 20),
    ('HIV',     'HIV',    'NR',  N'Non-reactive', 10),
    ('HIV',     'HIV',    'R',   N'Reactive', 20),
    ('VDRL',    'VDRL',   'NR',  N'Non-reactive', 10),
    ('VDRL',    'VDRL',   'R',   N'Reactive', 20),
    ('UPT',     'UPT',    'NEG', N'Negative', 10),
    ('UPT',     'UPT',    'POS', N'Positive', 20),
    ('HBSAG',   'HBSAG',  'NR',  N'Non-reactive', 10),
    ('HBSAG',   'HBSAG',  'R',   N'Reactive', 20),
    ('HCV',     'HCV',    'NR',  N'Non-reactive', 10),
    ('HCV',     'HCV',    'R',   N'Reactive', 20),
    ('HAV',     'HAV',    'NEG', N'Negative', 10),
    ('HAV',     'HAV',    'POS', N'Positive', 20),
    ('HEV',     'HEV',    'NEG', N'Negative', 10),
    ('HEV',     'HEV',    'POS', N'Positive', 20),
    ('DENGUE',  'NS1',    'NEG', N'Negative', 10),
    ('DENGUE',  'NS1',    'POS', N'Positive', 20),
    ('DENGUE',  'IGG',    'NEG', N'Negative', 10),
    ('DENGUE',  'IGG',    'POS', N'Positive', 20),
    ('DENGUE',  'IGM',    'NEG', N'Negative', 10),
    ('DENGUE',  'IGM',    'POS', N'Positive', 20);

/* 1. Tests: update what exists, insert what is missing. */
UPDATE t
SET name = s.Name,
    report_title = s.Name,
    category_id = c.id,
    specimen_id = sp.id,
    display_order = s.DisplayOrder,
    notes = s.Notes,
    active = 1
FROM dbo.test t
JOIN @Tests s ON s.Code = t.code
LEFT JOIN dbo.category c ON c.code = s.CategoryCode
LEFT JOIN dbo.specimen sp ON sp.code = s.SpecimenCode;

INSERT INTO dbo.test (code, name, report_title, category_id, specimen_id, display_order, notes, active)
SELECT s.Code, s.Name, s.Name, c.id, sp.id, s.DisplayOrder, s.Notes, 1
FROM @Tests s
JOIN dbo.category c ON c.code = s.CategoryCode
JOIN dbo.specimen sp ON sp.Code = s.SpecimenCode
WHERE NOT EXISTS (SELECT 1 FROM dbo.test t WHERE t.code = s.Code);

/* 2. Parameters: update what exists, insert what is missing. */
UPDATE p
SET name = s.Name,
    data_type = s.DataType,
    unit = s.Unit,
    normal_ranges = s.Ranges,
    display_order = s.DisplayOrder,
    notes = s.Notes,
    active = 1
FROM dbo.test_parameter p
JOIN dbo.test t ON t.id = p.test_id
JOIN @Params s ON s.TestCode = t.code AND s.Code = p.code;

INSERT INTO dbo.test_parameter (test_id, code, name, data_type, unit, normal_ranges, display_order, notes, active)
SELECT t.id, s.Code, s.Name, s.DataType, s.Unit, s.Ranges, s.DisplayOrder, s.Notes, 1
FROM @Params s
JOIN dbo.test t ON t.code = s.TestCode
WHERE NOT EXISTS (SELECT 1 FROM dbo.test_parameter p WHERE p.test_id = t.id AND p.code = s.Code);

/* 3. Dropdown options: update what exists, insert what is missing. */
UPDATE o
SET label = s.Label,
    sort_order = s.SortOrder,
    active = 1
FROM dbo.parameter_option o
JOIN dbo.test_parameter p ON p.id = o.parameter_id
JOIN dbo.test t ON t.id = p.test_id
JOIN @Options s ON s.TestCode = t.code AND s.ParamCode = p.code AND s.Code = o.code;

INSERT INTO dbo.parameter_option (parameter_id, code, label, sort_order, active)
SELECT p.id, s.Code, s.Label, s.SortOrder, 1
FROM @Options s
JOIN dbo.test t ON t.code = s.TestCode
JOIN dbo.test_parameter p ON p.test_id = t.id AND p.code = s.ParamCode
WHERE NOT EXISTS (SELECT 1 FROM dbo.parameter_option o WHERE o.parameter_id = p.id AND o.code = s.Code);

/* 4. Cleanup. Anything outside this menu is removed when no result holds a
   value for it, and switched inactive when one does, so old reports keep
   rendering while the entry screens only offer this menu. */
DELETE o
FROM dbo.parameter_option o
JOIN dbo.test_parameter p ON p.id = o.parameter_id
JOIN dbo.test t ON t.id = p.test_id
WHERE NOT EXISTS (SELECT 1 FROM @Params s WHERE s.TestCode = t.code AND s.Code = p.code)
  AND NOT EXISTS (SELECT 1 FROM dbo.result_value rv WHERE rv.parameter_id = p.id);

DELETE p
FROM dbo.test_parameter p
JOIN dbo.test t ON t.id = p.test_id
WHERE NOT EXISTS (SELECT 1 FROM @Params s WHERE s.TestCode = t.code AND s.Code = p.code)
  AND NOT EXISTS (SELECT 1 FROM dbo.result_value rv WHERE rv.parameter_id = p.id);

UPDATE p
SET active = 0
FROM dbo.test_parameter p
JOIN dbo.test t ON t.id = p.test_id
WHERE NOT EXISTS (SELECT 1 FROM @Params s WHERE s.TestCode = t.code AND s.Code = p.code);

DELETE t
FROM dbo.test t
WHERE NOT EXISTS (SELECT 1 FROM @Tests s WHERE s.Code = t.code)
  AND NOT EXISTS (SELECT 1 FROM dbo.test_parameter p WHERE p.test_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM dbo.lab_result r WHERE r.test_id = t.id);

UPDATE t
SET active = 0
FROM dbo.test t
WHERE NOT EXISTS (SELECT 1 FROM @Tests s WHERE s.Code = t.code);

COMMIT;

SELECT
    (SELECT COUNT(*) FROM dbo.test WHERE active = 1) AS active_tests,
    (SELECT COUNT(*) FROM dbo.test WHERE active = 0) AS inactive_tests,
    (SELECT COUNT(*) FROM dbo.test_parameter p JOIN dbo.test t ON t.id = p.test_id WHERE t.active = 1 AND p.active = 1) AS active_params,
    (SELECT COUNT(*) FROM dbo.parameter_option o JOIN dbo.test_parameter p ON p.id = o.parameter_id WHERE p.active = 1 AND o.active = 1) AS active_options;
