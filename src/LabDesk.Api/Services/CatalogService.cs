namespace LabDesk.Api;

/// <summary>
/// The rules for the catalog: masters, tests, parameters with their one normal
/// range, and dropdown options. Storage is the repository's job; this class only
/// decides what is allowed and what the audit trail records.
/// </summary>
public sealed class CatalogService(CatalogRepository catalog)
{
    private static readonly string[] DataTypes = ["Numeric", "Text", "Dropdown", "Boolean", "Date"];

    private static string Kind(string? value) => value?.Trim() switch
    {
        "Category" => "Category",
        "Specimen" => "Specimen",
        "Method" => "Method",
        _ => throw new ArgumentException("kind must be Category, Specimen, or Method.")
    };

    public async Task<Catalog> CatalogAsync() => new(
        await catalog.TestsAsync(),
        await catalog.ParametersAsync(),
        await catalog.OptionsAsync(),
        await catalog.MastersAsync("Category"),
        await catalog.MastersAsync("Specimen"),
        await catalog.MastersAsync("Method"));

    // ------------------------------------------------------------------ masters

    public async Task<Master> SaveMasterAsync(MasterInput input)
    {
        var kind = Kind(input.Kind);
        Validate.Code(input.Code);
        var name = Validate.Required(input.Name, "name");
        Validate.Max(name, 200, "name");
        var before = input.Id is null ? null : await catalog.MasterAsync(kind, input.Id.Value);
        var master = new Master(input.Id, input.Code.Trim(), name, input.Active);
        return await catalog.SaveMasterAsync(kind, master, AuditRepository.Note(
            input.Id is null ? "created" : "updated", new { before, after = master }));
    }

    // -------------------------------------------------------------------- tests

    public async Task<Test> SaveTestAsync(Test input)
    {
        Validate.Code(input.Code);
        var name = Validate.Required(input.Name, "name");
        Validate.Max(name, 200, "name");
        Validate.Max(input.ShortName, 60, "shortName");
        Validate.Max(input.Description, 1000, "description");
        Validate.Max(input.PatientPreparation, 1000, "patientPreparation");
        Validate.Max(input.CollectionInstructions, 1000, "collectionInstructions");
        Validate.Max(input.Container, 200, "container");
        Validate.Max(input.MinimumSample, 200, "minimumSample");
        Validate.Max(input.TurnaroundTime, 100, "turnaroundTime");
        Validate.Max(input.ReportTitle, 200, "reportTitle");
        Validate.Max(input.Notes, 1000, "notes");
        Validate.Require(input.DisplayOrder >= 0, "displayOrder must be zero or greater.");

        Validate.Known(await catalog.MasterAsync("Category", input.CategoryId) is not null, "Category",
            input.CategoryId);
        Validate.Known(await catalog.MasterAsync("Specimen", input.SpecimenTypeId) is not null, "Specimen",
            input.SpecimenTypeId);
        if (input.MethodId is int methodId)
        {
            Validate.Known(await catalog.MasterAsync("Method", methodId) is not null, "Method", methodId);
        }

        var before = input.Id is null ? null : await catalog.TestAsync(input.Id.Value);
        var test = input with { Code = input.Code.Trim(), Name = name };
        return await catalog.SaveTestAsync(test, AuditRepository.Note(
            input.Id is null ? "created" : "updated", new { before, after = test }));
    }

    // --------------------------------------------------------------- parameters

    public async Task<TestParameter> SaveParameterAsync(TestParameter input)
    {
        Validate.Code(input.Code);
        var name = Validate.Required(input.Name, "name");
        Validate.Max(name, 200, "name");
        Validate.Require(DataTypes.Contains(input.DataType), "Unsupported dataType.");
        Validate.Max(input.Unit, 40, "unit");
        Validate.Max(input.ResultFormat, 40, "resultFormat");
        Validate.Max(input.Notes, 1000, "notes");
        Validate.Require(input.DisplayOrder >= 0, "displayOrder must be zero or greater.");
        Validate.Require(input.DecimalPlaces is null or >= 0 and <= 8, "decimalPlaces must be from 0 through 8.");
        Validate.Require(input.TechnicalMin is null || input.TechnicalMax is null ||
            input.TechnicalMin <= input.TechnicalMax, "technicalMin must not exceed technicalMax.");
        Validate.Require(input.DataType == "Numeric" || input.TechnicalMin is null && input.TechnicalMax is null,
            "Technical limits are only valid for Numeric parameters.");
        var normalRanges = Validate.Ranges(input.NormalRanges);

        Validate.Known(await catalog.TestAsync(input.TestId) is not null, "Test", input.TestId);
        var before = input.Id is null ? null : await catalog.ParameterAsync(input.Id.Value);
        if (before is not null)
        {
            Validate.Require(before.TestId == input.TestId, "testId is immutable on parameter update.");
            // Options belong to the parameter, so they cannot outlive its dropdown.
            if (before.DataType == "Dropdown" && input.DataType != "Dropdown" &&
                (await catalog.OptionsAsync(before.Id)).Any(option => option.Active))
            {
                throw new ArgumentException("Deactivate this parameter's options before changing it away from Dropdown.");
            }
        }

        var parameter = input with { Code = input.Code.Trim(), Name = name, NormalRanges = normalRanges };
        return await catalog.SaveParameterAsync(parameter, AuditRepository.Note(
            input.Id is null ? "created" : "updated", new { before, after = parameter }));
    }

    // ------------------------------------------------------------------ options

    public async Task<ParameterOption> SaveOptionAsync(ParameterOption input)
    {
        var parameter = await catalog.ParameterAsync(input.ParameterId)
            ?? throw new ArgumentException($"Parameter {input.ParameterId} was not found.");
        Validate.Code(input.Code);
        var label = Validate.Required(input.Label, "label");
        Validate.Max(label, 200, "label");
        Validate.Require(input.SortOrder >= 0, "sortOrder must be zero or greater.");

        var before = input.Id is null ? null : await catalog.OptionAsync(input.Id.Value);
        if (before is not null)
        {
            Validate.Require(before.ParameterId == input.ParameterId,
                "parameterId is immutable on option update.");
        }

        // An existing option on a no-longer-dropdown parameter may still be edited
        // to switch it off; it just cannot be created or switched back on.
        var allowed = parameter.DataType == "Dropdown" || (before is not null && !input.Active);
        Validate.Require(allowed, "Options can only be created or activated for Dropdown parameters.");
        var option = input with { Code = input.Code.Trim(), Label = label };
        return await catalog.SaveOptionAsync(option, AuditRepository.Note(
            input.Id is null ? "created" : "updated", new { before, after = option }));
    }
}
