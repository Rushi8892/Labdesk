/* =====================================================================
   Master test menu: the lab's own catalogue.

   Source: lab_tests_parameters.pdf (31 tests) + Dengue + CBC details
           + Urine Routine Examination + Stool Examination.
   This file is the authority for the catalogue, so it is safe to re-run:
   it inserts what is missing and rewrites names, units, reference ranges
   and dropdown options in place. A parameter's Section groups the report
   under a heading ("Microscopic Examination"); blank prints one table.

   Rows that are no longer in this list are removed when nothing recorded
   a value against them. When a result already references them they are
   kept, so old reports still render, but switched inactive so they stop
   being offered at result entry.

   Run after schema.sql and seed.sql. Save this file as UTF-8 with BOM
   (it contains the micro sign) and run with -f 65001:
       sqlcmd -S "(localdb)\MSSQLLocalDB" -d PathologyTests -E -f 65001 -i database/seed-menu.sql
   ===================================================================== */
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

/* 0. Urine and stool use the categories and specimens seed.sql already ships:
   URI / UR for urine, MIC / ST for stool. Nothing new to insert. */

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
    ('DENGUE',  N'Dengue',                                                'SEROLOGY', 'SER', 320, NULL),
    ('URINE',   N'Urine Routine Examination',                             'URI',      'UR',  330, N'HPF = High Power Field. Reference ranges may vary by laboratory method and reporting protocol.'),
    ('STOOL',   N'Stool Examination',                                     'MIC',      'ST',  340, N'HPF = High Power Field; LPF = Low Power Field. Reference ranges may vary by laboratory method, microscope technique and reporting protocol. Kindly correlate clinically.');

/* Fail loudly if any test points at a category or specimen that does not
   exist, instead of silently skipping it. */
IF EXISTS (
    SELECT 1 FROM @Tests s
    WHERE NOT EXISTS (SELECT 1 FROM dbo.category c WHERE c.code = s.CategoryCode)
       OR NOT EXISTS (SELECT 1 FROM dbo.specimen sp WHERE sp.code = s.SpecimenCode))
    THROW 50001, 'seed-menu: a test refers to a category or specimen code that does not exist.', 1;

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
    Section NVARCHAR(100) NULL,
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
    ('DENGUE', 'IGM', N'IgM Antibody',                                  'Dropdown', NULL,         N'["Negative"]',    30, NULL),
    -- Urine Routine Examination (physical)
    ('URINE', 'COLOUR', N'Colour',                                      'Dropdown', NULL,         N'["Pale yellow","Yellow"]', 10, NULL),
    ('URINE', 'APPEAR', N'Appearance',                                  'Dropdown', NULL,         N'["Clear"]',       20, NULL),
    ('URINE', 'SG',     N'Specific Gravity',                            'Numeric',  NULL,         N'["1.005 - 1.030"]', 30, NULL),
    ('URINE', 'PH',     N'pH',                                          'Numeric',  NULL,         N'["4.5 - 8.0"]',   40, NULL),
    -- Urine Routine Examination (chemical)
    ('URINE', 'PROT',   N'Protein',                                     'Dropdown', NULL,         N'["Negative"]',    50, NULL),
    ('URINE', 'GLU',    N'Glucose',                                     'Dropdown', NULL,         N'["Negative"]',    60, NULL),
    ('URINE', 'KET',    N'Ketones',                                     'Dropdown', NULL,         N'["Negative"]',    70, NULL),
    ('URINE', 'BLOOD',  N'Blood',                                       'Dropdown', NULL,         N'["Negative"]',    80, NULL),
    ('URINE', 'BILE',   N'Bile Pigments',                               'Dropdown', NULL,         N'["Negative"]',    90, NULL),
    ('URINE', 'NIT',    N'Nitrite',                                     'Dropdown', NULL,         N'["Negative"]',    100, NULL),
    ('URINE', 'LE',     N'Leukocyte Esterase',                          'Dropdown', NULL,         N'["Negative"]',    110, NULL),
    -- Urine Routine Examination (microscopic)
    ('URINE', 'PUS',    N'Pus Cells',                                   'Dropdown', N'/HPF',      N'["Nil","0 - 2"]', 120, NULL),
    ('URINE', 'RBC',    N'RBC',                                         'Dropdown', N'/HPF',      N'["Nil"]',         130, NULL),
    ('URINE', 'EPI',    N'Epithelial Cells',                            'Dropdown', N'/HPF',      N'["Nil","0 - 2"]', 140, NULL),
    ('URINE', 'CAST',   N'Casts',                                       'Dropdown', NULL,         N'["Nil"]',         150, NULL),
    ('URINE', 'CRYST',  N'Crystals',                                    'Dropdown', NULL,         N'["Nil"]',         160, NULL),
    ('URINE', 'BACT',   N'Bacteria',                                    'Dropdown', NULL,         N'["Not seen"]',    170, NULL),
    -- Stool Examination (macroscopic)
    ('STOOL', 'COLOUR', N'Colour',                                      'Dropdown', NULL,         N'["Brown","Yellowish brown"]', 10, NULL),
    ('STOOL', 'CONS',   N'Appearance (Consistency)',                    'Dropdown', NULL,         N'["Formed","Semi-formed"]', 20, NULL),
    ('STOOL', 'ODOUR',  N'Odour',                                       'Dropdown', NULL,         N'["Characteristic"]', 30, NULL),
    ('STOOL', 'MUCUS',  N'Mucus',                                       'Dropdown', NULL,         N'["Absent","Occasional"]', 40, NULL),
    ('STOOL', 'BLOOD',  N'Blood',                                       'Dropdown', NULL,         N'["Absent"]',      50, NULL),
    ('STOOL', 'FOOD',   N'Undigested Food Particles',                   'Dropdown', NULL,         N'["Absent","Occasional"]', 60, NULL),
    ('STOOL', 'VOL',    N'Volume',                                      'Dropdown', NULL,         NULL,               70, N'Not routinely interpreted.'),
    -- Stool Examination (microscopic)
    ('STOOL', 'PUS',    N'Pus Cells (WBC)',                             'Dropdown', N'/HPF',      N'["Nil","Occasional","0 - 2","2 - 5"]', 80, N'Normal: 0 - 5 /HPF.'),
    ('STOOL', 'RBC',    N'RBC (Red Blood Cells)',                       'Dropdown', N'/HPF',      N'["Nil","0 - 2"]', 90, N'Normal: 0 - 2 /HPF.'),
    ('STOOL', 'EPI',    N'Epithelial Cells',                            'Dropdown', N'/HPF',      N'["Nil","0 - 2"]', 100, N'Normal: 0 - 2 /HPF.'),
    ('STOOL', 'FAT',    N'Fat Droplets',                                'Dropdown', NULL,         N'["Nil","Occasional"]', 110, NULL),
    ('STOOL', 'MUSCLE', N'Muscle Fibers',                               'Dropdown', NULL,         N'["Nil","Occasional"]', 120, NULL),
    ('STOOL', 'VEG',    N'Vegetable Fibers',                            'Dropdown', NULL,         N'["Few","Occasional"]', 130, NULL),
    ('STOOL', 'STARCH', N'Starch Granules',                             'Dropdown', NULL,         N'["Nil","Occasional"]', 140, NULL),
    ('STOOL', 'CASTS',  N'Casts',                                       'Dropdown', NULL,         N'["Nil"]',         150, NULL),
    ('STOOL', 'CRYST',  N'Crystals',                                    'Dropdown', NULL,         N'["Nil","Occasional"]', 160, NULL),
    ('STOOL', 'BACT',   N'Bacteria',                                    'Dropdown', NULL,         N'["Few","Moderate"]', 170, NULL),
    ('STOOL', 'YEAST',  N'Yeast Cells',                                 'Dropdown', NULL,         N'["Nil"]',         180, NULL),
    ('STOOL', 'MTHR',   N'Mucus Threads',                               'Dropdown', NULL,         N'["Nil","Occasional"]', 190, NULL),
    -- Stool Examination (ova and parasites)
    ('STOOL', 'OVA',    N'Ova (Eggs)',                                  'Dropdown', NULL,         N'["Not seen"]',    200, NULL),
    ('STOOL', 'CYST',   N'Cysts',                                       'Dropdown', NULL,         N'["Not seen"]',    210, NULL),
    ('STOOL', 'TROPH',  N'Trophozoites',                                'Dropdown', NULL,         N'["Not seen"]',    220, NULL),
    ('STOOL', 'HELM',   N'Helminths (Worms)',                           'Dropdown', NULL,         N'["Not seen"]',    230, NULL);

/* Urine and stool print their rows under group headings; every other test
   prints one flat table. The heading follows the display-order runs above. */
UPDATE @Params SET Section = N'Physical Examination'
    WHERE TestCode = 'URINE' AND Code IN ('COLOUR', 'APPEAR', 'SG', 'PH');
UPDATE @Params SET Section = N'Chemical Examination'
    WHERE TestCode = 'URINE' AND Code IN ('PROT', 'GLU', 'KET', 'BLOOD', 'BILE', 'NIT', 'LE');
UPDATE @Params SET Section = N'Microscopic Examination'
    WHERE TestCode = 'URINE' AND Code IN ('PUS', 'RBC', 'EPI', 'CAST', 'CRYST', 'BACT');
UPDATE @Params SET Section = N'Macroscopic Examination'
    WHERE TestCode = 'STOOL' AND Code IN ('COLOUR', 'CONS', 'ODOUR', 'MUCUS', 'BLOOD', 'FOOD', 'VOL');
UPDATE @Params SET Section = N'Microscopic Examination'
    WHERE TestCode = 'STOOL' AND Code IN ('PUS', 'RBC', 'EPI', 'FAT', 'MUSCLE', 'VEG', 'STARCH',
        'CASTS', 'CRYST', 'BACT', 'YEAST', 'MTHR');
UPDATE @Params SET Section = N'Ova & Parasites (O&P)'
    WHERE TestCode = 'STOOL' AND Code IN ('OVA', 'CYST', 'TROPH', 'HELM');

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

/* Urine and stool dropdowns share a handful of option lists, so they are
   defined once as named sets and attached to parameters below. */
DECLARE @OptionSets TABLE
(
    SetCode VARCHAR(40) NOT NULL,
    Code VARCHAR(20) NOT NULL,
    Label NVARCHAR(100) NOT NULL,
    SortOrder INT NOT NULL,
    PRIMARY KEY (SetCode, Code)
);

INSERT INTO @OptionSets (SetCode, Code, Label, SortOrder) VALUES
    -- Graded dipstick result
    ('GRADE',  'NEG',   N'Negative', 10),
    ('GRADE',  'TRACE', N'Trace',    20),
    ('GRADE',  'P1',    N'1+',       30),
    ('GRADE',  'P2',    N'2+',       40),
    ('GRADE',  'P3',    N'3+',       50),
    ('GRADE',  'P4',    N'4+',       60),
    -- Negative / Positive
    ('NEGPOS', 'NEG',   N'Negative', 10),
    ('NEGPOS', 'POS',   N'Positive', 20),
    -- Cells per high power field
    ('HPF',    'NIL',   N'Nil',        10),
    ('HPF',    'OCC',   N'Occasional', 20),
    ('HPF',    'B0_2',  N'0 - 2',      30),
    ('HPF',    'B2_5',  N'2 - 5',      40),
    ('HPF',    'B5_10', N'5 - 10',     50),
    ('HPF',    'B10_20',N'10 - 20',    60),
    ('HPF',    'B20_30',N'20 - 30',    70),
    ('HPF',    'GT30',  N'> 30',       80),
    -- Urine physical
    ('U_COLOUR','COLRLS', N'Colourless',  10),
    ('U_COLOUR','PALE',   N'Pale yellow', 20),
    ('U_COLOUR','YEL',    N'Yellow',      30),
    ('U_COLOUR','DYEL',   N'Dark yellow', 40),
    ('U_COLOUR','AMB',    N'Amber',       50),
    ('U_COLOUR','RED',    N'Red',         60),
    ('U_COLOUR','BRN',    N'Brown',       70),
    ('U_APPEAR','CLEAR',  N'Clear',          10),
    ('U_APPEAR','SLTURB', N'Slightly turbid',20),
    ('U_APPEAR','TURB',   N'Turbid',         30),
    -- Urine microscopic
    ('U_CASTS', 'NIL',   N'Nil',           10),
    ('U_CASTS', 'HYAL',  N'Hyaline casts', 20),
    ('U_CASTS', 'GRAN',  N'Granular casts',30),
    ('U_CASTS', 'RBCC',  N'RBC casts',     40),
    ('U_CASTS', 'WBCC',  N'WBC casts',     50),
    ('U_CASTS', 'WAXY',  N'Waxy casts',    60),
    ('U_CRYST', 'NIL',   N'Nil',                  10),
    ('U_CRYST', 'CAOX',  N'Calcium oxalate',      20),
    ('U_CRYST', 'URIC',  N'Uric acid',            30),
    ('U_CRYST', 'TRIP',  N'Triple phosphate',     40),
    ('U_CRYST', 'AMUR',  N'Amorphous urates',     50),
    ('U_CRYST', 'AMPH',  N'Amorphous phosphates', 60),
    ('U_CRYST', 'OTH',   N'Other',                70),
    ('U_BACT',  'NSEEN', N'Not seen', 10),
    ('U_BACT',  'FEW',   N'Few',      20),
    ('U_BACT',  'MOD',   N'Moderate', 30),
    ('U_BACT',  'MANY',  N'Many',     40),
    -- Stool macroscopic
    ('S_COLOUR','BRN',   N'Brown',           10),
    ('S_COLOUR','YBRN',  N'Yellowish brown', 20),
    ('S_COLOUR','DBRN',  N'Dark brown',      30),
    ('S_COLOUR','YEL',   N'Yellow',          40),
    ('S_COLOUR','GRN',   N'Green',           50),
    ('S_COLOUR','BLK',   N'Black',           60),
    ('S_COLOUR','RED',   N'Red',             70),
    ('S_COLOUR','CLAY',  N'Clay coloured',   80),
    ('S_CONS',  'FORMED',N'Formed',      10),
    ('S_CONS',  'SEMI',  N'Semi-formed', 20),
    ('S_CONS',  'SOFT',  N'Soft',        30),
    ('S_CONS',  'LOOSE', N'Loose',       40),
    ('S_CONS',  'WATERY',N'Watery',      50),
    ('S_CONS',  'HARD',  N'Hard',        60),
    ('S_ODOUR', 'CHAR',  N'Characteristic', 10),
    ('S_ODOUR', 'OFFN',  N'Offensive',      20),
    ('ABS_OCC_PRES','ABS', N'Absent',     10),
    ('ABS_OCC_PRES','OCC', N'Occasional', 20),
    ('ABS_OCC_PRES','PRES',N'Present',    30),
    ('ABS_PRES','ABS',   N'Absent',  10),
    ('ABS_PRES','PRES',  N'Present', 20),
    ('S_VOL',   'NA',    N'Not applicable', 10),
    ('S_VOL',   'SCANTY',N'Scanty',         20),
    ('S_VOL',   'MOD',   N'Moderate',       30),
    ('S_VOL',   'COPIOUS',N'Copious',       40),
    -- Stool microscopic
    ('NIL_SCALE','NIL',  N'Nil',        10),
    ('NIL_SCALE','OCC',  N'Occasional', 20),
    ('NIL_SCALE','FEW',  N'Few',        30),
    ('NIL_SCALE','MOD',  N'Moderate',   40),
    ('NIL_SCALE','MANY', N'Many',       50),
    ('NIL_PRES','NIL',   N'Nil',     10),
    ('NIL_PRES','PRES',  N'Present', 20),
    -- Ova and parasites
    ('SEEN',    'NSEEN', N'Not seen', 10),
    ('SEEN',    'SEEN',  N'Seen',     20);

DECLARE @ParamSets TABLE
(
    TestCode VARCHAR(40) NOT NULL,
    ParamCode VARCHAR(40) NOT NULL,
    SetCode VARCHAR(40) NOT NULL,
    PRIMARY KEY (TestCode, ParamCode)
);

INSERT INTO @ParamSets (TestCode, ParamCode, SetCode) VALUES
    ('URINE', 'COLOUR', 'U_COLOUR'),
    ('URINE', 'APPEAR', 'U_APPEAR'),
    ('URINE', 'PROT',   'GRADE'),
    ('URINE', 'GLU',    'GRADE'),
    ('URINE', 'KET',    'GRADE'),
    ('URINE', 'BLOOD',  'GRADE'),
    ('URINE', 'BILE',   'NEGPOS'),
    ('URINE', 'NIT',    'NEGPOS'),
    ('URINE', 'LE',     'GRADE'),
    ('URINE', 'PUS',    'HPF'),
    ('URINE', 'RBC',    'HPF'),
    ('URINE', 'EPI',    'HPF'),
    ('URINE', 'CAST',   'U_CASTS'),
    ('URINE', 'CRYST',  'U_CRYST'),
    ('URINE', 'BACT',   'U_BACT'),
    ('STOOL', 'COLOUR', 'S_COLOUR'),
    ('STOOL', 'CONS',   'S_CONS'),
    ('STOOL', 'ODOUR',  'S_ODOUR'),
    ('STOOL', 'MUCUS',  'ABS_OCC_PRES'),
    ('STOOL', 'BLOOD',  'ABS_PRES'),
    ('STOOL', 'FOOD',   'ABS_OCC_PRES'),
    ('STOOL', 'VOL',    'S_VOL'),
    ('STOOL', 'PUS',    'HPF'),
    ('STOOL', 'RBC',    'HPF'),
    ('STOOL', 'EPI',    'HPF'),
    ('STOOL', 'FAT',    'NIL_SCALE'),
    ('STOOL', 'MUSCLE', 'NIL_SCALE'),
    ('STOOL', 'VEG',    'NIL_SCALE'),
    ('STOOL', 'STARCH', 'NIL_SCALE'),
    ('STOOL', 'CASTS',  'NIL_PRES'),
    ('STOOL', 'CRYST',  'NIL_SCALE'),
    ('STOOL', 'BACT',   'NIL_SCALE'),
    ('STOOL', 'YEAST',  'NIL_SCALE'),
    ('STOOL', 'MTHR',   'NIL_SCALE'),
    ('STOOL', 'OVA',    'SEEN'),
    ('STOOL', 'CYST',   'SEEN'),
    ('STOOL', 'TROPH',  'SEEN'),
    ('STOOL', 'HELM',   'SEEN');

INSERT INTO @Options (TestCode, ParamCode, Code, Label, SortOrder)
SELECT ps.TestCode, ps.ParamCode, os.Code, os.Label, os.SortOrder
FROM @ParamSets ps
JOIN @OptionSets os ON os.SetCode = ps.SetCode;

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
JOIN dbo.specimen sp ON sp.code = s.SpecimenCode
WHERE NOT EXISTS (SELECT 1 FROM dbo.test t WHERE t.code = s.Code);

/* 2. Parameters: update what exists, insert what is missing. */
UPDATE p
SET name = s.Name,
    data_type = s.DataType,
    unit = s.Unit,
    normal_ranges = s.Ranges,
    display_order = s.DisplayOrder,
    notes = s.Notes,
    section = s.Section,
    active = 1
FROM dbo.test_parameter p
JOIN dbo.test t ON t.id = p.test_id
JOIN @Params s ON s.TestCode = t.code AND s.Code = p.code;

INSERT INTO dbo.test_parameter (test_id, code, name, data_type, unit, normal_ranges, display_order, notes, section, active)
SELECT t.id, s.Code, s.Name, s.DataType, s.Unit, s.Ranges, s.DisplayOrder, s.Notes, s.Section, 1
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