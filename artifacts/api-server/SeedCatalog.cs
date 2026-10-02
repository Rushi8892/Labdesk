namespace LabDesk.Api;

public static class SeedCatalog
{
    public static async Task Seed(Repository repository)
    {
        if ((await repository.List<Test>("Test")).Count != 0) return;
        var categories = new Dictionary<string, int>();
        foreach (var (code, name) in new[] { ("HEM", "Hematology"), ("BIO", "Clinical Chemistry"), ("URI", "Urinalysis"), ("MIC", "Microbiology") })
            categories[code] = (await repository.Save("Category", null, 0, code, true,
                id => new Master(id, code, name, true), "Category", "seed", "created", "{\"seed\":true}")).Id!.Value;
        var specimens = new Dictionary<string, int>();
        foreach (var (code, name) in new[] { ("WB", "Whole blood"), ("SER", "Serum"), ("PL", "Plasma"), ("UR", "Urine"), ("ST", "Stool") })
            specimens[code] = (await repository.Save("Specimen", null, 0, code, true,
                id => new Master(id, code, name, true), "Specimen", "seed", "created", "{\"seed\":true}")).Id!.Value;

        var definitions = new[]
        {
            new TestDefinition("CBC", "Complete Blood Count", "HEM", "WB", new[] {
                ("WBC", "White blood cell count", "Numeric", "10^9/L"), ("RBC", "Red blood cell count", "Numeric", "10^12/L"),
                ("HGB", "Hemoglobin", "Numeric", "g/dL"), ("HCT", "Hematocrit", "Numeric", "%"),
                ("PLT", "Platelet count", "Numeric", "10^9/L") }),
            new TestDefinition("FBS", "Fasting Blood Glucose", "BIO", "PL", new[] { ("GLU", "Glucose", "Numeric", "mg/dL") }),
            new TestDefinition("PPBS", "Postprandial Blood Glucose", "BIO", "PL", new[] { ("GLU", "Glucose", "Numeric", "mg/dL") }),
            new TestDefinition("HBA1C", "HbA1c", "BIO", "WB", new[] { ("HBA1C", "Hemoglobin A1c", "Numeric", "%") }),
            new TestDefinition("LIPID", "Lipid Profile", "BIO", "SER", new[] {
                ("TC", "Total cholesterol", "Numeric", "mg/dL"), ("HDL", "HDL cholesterol", "Numeric", "mg/dL"),
                ("LDL", "LDL cholesterol", "Numeric", "mg/dL"), ("TG", "Triglycerides", "Numeric", "mg/dL") }),
            new TestDefinition("LFT", "Liver Function Test", "BIO", "SER", new[] {
                ("ALT", "Alanine aminotransferase", "Numeric", "U/L"), ("AST", "Aspartate aminotransferase", "Numeric", "U/L"),
                ("ALP", "Alkaline phosphatase", "Numeric", "U/L"), ("TBIL", "Total bilirubin", "Numeric", "mg/dL"),
                ("ALB", "Albumin", "Numeric", "g/dL") }),
            new TestDefinition("KFT", "Kidney Function Test", "BIO", "SER", new[] {
                ("UREA", "Urea", "Numeric", "mg/dL"), ("CREAT", "Creatinine", "Numeric", "mg/dL"),
                ("NA", "Sodium", "Numeric", "mmol/L"), ("K", "Potassium", "Numeric", "mmol/L") }),
            new TestDefinition("THYROID", "Thyroid Profile", "BIO", "SER", new[] {
                ("TSH", "Thyroid stimulating hormone", "Numeric", "mIU/L"), ("T3", "Triiodothyronine", "Numeric", "nmol/L"),
                ("T4", "Thyroxine", "Numeric", "pmol/L") }),
            new TestDefinition("URINALYSIS", "Urinalysis", "URI", "UR", new[] {
                ("COLOR", "Color", "Text", ""), ("APPEAR", "Appearance", "Dropdown", ""), ("PH", "pH", "Numeric", ""),
                ("PROTEIN", "Protein", "Dropdown", ""), ("GLUCOSE", "Glucose", "Dropdown", ""), ("SG", "Specific gravity", "Numeric", "") }),
            new TestDefinition("STOOL", "Stool Routine Examination", "MIC", "ST", new[] {
                ("COLOR", "Color", "Text", ""), ("CONSIST", "Consistency", "Dropdown", ""), ("OCCULT", "Occult blood", "Dropdown", ""),
                ("PH", "pH", "Numeric", ""), ("MICROSCOPY", "Microscopy", "Text", "") }),
            new TestDefinition("ESR", "ESR", "HEM", "WB", new[] { ("ESR", "Erythrocyte sedimentation rate", "Numeric", "mm/hr") }),
            new TestDefinition("CRP", "CRP", "BIO", "SER", new[] { ("CRP", "C-reactive protein", "Numeric", "mg/L") })
        };
        var order = 1;
        foreach (var definition in definitions)
        {
            var test = await repository.Save("Test", null, 0, definition.Code, true, id =>
                new Test(id, definition.Code, definition.Name, null, categories[definition.Category], specimens[definition.Specimen],
                    null, null, null, null, null, null, null, 0m, order, true, definition.Name, null),
                "Test", "seed", "created", "{\"seed\":true}");
            var parameterOrder = 1;
            foreach (var (code, name, type, unit) in definition.Parameters)
            {
                var paramCode = code;
                var parentTestId = test.Id!.Value;
                await repository.Save("Parameter", null, parentTestId, paramCode, true, id =>
                    new TestParameter(id, parentTestId, paramCode, name, type, unit, null, type == "Numeric" ? 2 : null,
                        true, false, null, null, "None", null, parameterOrder++, true, null),
                    "Parameter", "seed", "created", "{\"seed\":true}");
            }
            order++;
        }
    }

    private sealed record TestDefinition(string Code, string Name, string Category, string Specimen,
        (string Code, string Name, string Type, string Unit)[] Parameters);
}