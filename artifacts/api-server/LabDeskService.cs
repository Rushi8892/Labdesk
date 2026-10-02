using System.Globalization;
using System.Text.Json;

namespace LabDesk.Api;

internal sealed record StoredResult(LabResult Result, Test Test, List<TestParameter> Parameters,
    List<ParameterOption> Options, List<ReferenceInterval> References, ReportSnapshot? Snapshot);

public sealed class LabDeskService(Repository repository)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static string Required(string? value, string field, int min = 1)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Trim().Length < min) throw new ArgumentException($"{field} is required.");
        return value.Trim();
    }
    private static string Actor(string? value, string field)
    {
        var actor = Required(value, field, 2);
        if (actor.Length > 200) throw new ArgumentException($"{field} must be no longer than 200 characters.");
        return actor;
    }
    private static string Kind(string? value)
    {
        var found = value?.Trim() switch { "Category" => "Category", "Specimen" => "Specimen", "Method" => "Method", _ => "" };
        if (found == "") throw new ArgumentException("kind must be Category, Specimen, or Method.");
        return found;
    }
    private static void CheckCode(string code)
    {
        Required(code, "code");
        if (code.Trim().Length > 255) throw new ArgumentException("code must be no longer than 255 characters.");
    }
    private static void Require(bool ok, string message) { if (!ok) throw new ArgumentException(message); }
    private static string Now() => DateTimeOffset.UtcNow.ToString("O");
    private async Task EnsureMaster(string kind, int? id)
    {
        if (id is null) return;
        if (await repository.Get<Master>(kind, id.Value) is null)
            throw new ArgumentException($"{kind} {id} was not found.");
    }

    public async Task<Catalog> Catalog()
    {
        var tests = await repository.List<Test>("Test");
        var parameters = await repository.List<TestParameter>("Parameter");
        var options = await repository.List<ParameterOption>("Option");
        var references = await repository.List<ReferenceInterval>("Reference");
        return new Catalog(tests, parameters, options, references,
            await repository.List<Master>("Category"), await repository.List<Master>("Specimen"), await repository.List<Master>("Method"));
    }

    public async Task<Master> SaveMaster(MasterInput input)
    {
        var kind = Kind(input.Kind); var code = Required(input.Code, "code"); CheckCode(code);
        var name = Required(input.Name, "name");
        if (await repository.CodeInUse(kind, 0, code, input.Id)) throw new ArgumentException($"A {kind} with code '{code}' already exists.");
        var before = input.Id is null ? null : await repository.Get<Master>(kind, input.Id.Value);
        if (input.Id is not null && before is null) throw new KeyNotFoundException($"{kind} {input.Id} was not found.");
        var master = await repository.Save(kind, input.Id, 0, code, input.Active, id => new Master(id, code, name, input.Active),
            kind, "operator", input.Id is null ? "created" : "updated",
            JsonSerializer.Serialize(new { before, after = new { code, name, active = input.Active } }, Json));
        return master;
    }

    public async Task<Test> SaveTest(Test input)
    {
        var code = Required(input.Code, "code"); CheckCode(code); var name = Required(input.Name, "name");
        Require(input.Price >= 0, "price must be greater than or equal to zero.");
        Require(input.DisplayOrder >= 0, "displayOrder must be zero or greater.");
        if (await repository.CodeInUse("Test", 0, code, input.Id)) throw new ArgumentException($"A test with code '{code}' already exists.");
        await EnsureMaster("Category", input.CategoryId); await EnsureMaster("Specimen", input.SpecimenTypeId);
        await EnsureMaster("Method", input.MethodId);
        var before = input.Id is null ? null : await repository.Get<Test>("Test", input.Id.Value);
        if (input.Id is not null && before is null) throw new KeyNotFoundException($"Test {input.Id} was not found.");
        var normalized = input with { Code = code, Name = name, Id = input.Id };
        return await repository.Save("Test", input.Id, 0, code, input.Active, id => normalized with { Id = id },
            "Test", "operator", input.Id is null ? "created" : "updated",
            JsonSerializer.Serialize(new { before, after = normalized }, Json));
    }

    public async Task<TestParameter> SaveParameter(TestParameter input)
    {
        var code = Required(input.Code, "code"); CheckCode(code); var name = Required(input.Name, "name");
        var test = await repository.Get<Test>("Test", input.TestId);
        if (test is null) throw new ArgumentException($"Test {input.TestId} was not found.");
        if (await repository.CodeInUse("Parameter", input.TestId, code, input.Id))
            throw new ArgumentException($"A parameter with code '{code}' already exists within this test.");
        Require(input.DisplayOrder >= 0, "displayOrder must be zero or greater.");
        Require(input.DecimalPlaces is null or >= 0 and <= 8, "decimalPlaces must be from 0 through 8.");
        Require(input.TechnicalMin is null || input.TechnicalMax is null || input.TechnicalMin <= input.TechnicalMax,
            "technicalMin must not exceed technicalMax.");
        Require(new[] { "Numeric", "Text", "Dropdown", "Boolean", "Date" }.Contains(input.DataType), "Unsupported dataType.");
        Require(new[] { "Range", "Text", "Decision Value", "None" }.Contains(input.ReferenceType), "Unsupported referenceType.");
        Require(input.DataType == "Numeric" || input.TechnicalMin is null && input.TechnicalMax is null,
            "Technical limits are only valid for Numeric parameters.");
        Require(input.ReferenceType switch {
            "Range" => input.DataType == "Numeric",
            "Text" => input.DataType is "Text" or "Dropdown" or "Boolean",
            "Decision Value" => input.DataType == "Numeric",
            _ => true
        }, "referenceType is not compatible with dataType.");
        var before = input.Id is null ? null : await repository.Get<TestParameter>("Parameter", input.Id.Value);
        if (before is not null && before.TestId != input.TestId) throw new ArgumentException("testId is immutable on parameter update.");
        if (input.Id is not null && before is null) throw new KeyNotFoundException($"Parameter {input.Id} was not found.");
        if (before is not null && before.DataType != input.DataType && input.DataType != "Dropdown" &&
            (await repository.List<ParameterOption>("Option")).Any(o => o.ParameterId == before.Id && o.Active))
            throw new ArgumentException("Deactivate this parameter's options before changing it away from Dropdown.");
        if (before is not null && !string.Equals(before.Unit?.Trim() ?? "", input.Unit?.Trim() ?? "", StringComparison.Ordinal) &&
            (await repository.List<ReferenceInterval>("Reference")).Any(r => r.ParameterId == before.Id && r.Active))
            throw new ArgumentException("Deactivate active references before changing this parameter's unit.");
        if (before is not null && before.ReferenceType != input.ReferenceType &&
            (await repository.List<ReferenceInterval>("Reference")).Any(r => r.ParameterId == before.Id && r.Active))
            throw new ArgumentException("Deactivate or version this parameter's active references before changing referenceType.");
        var normalized = input with { Code = code, Name = name };
        return await repository.Save("Parameter", input.Id, input.TestId, code, input.Active, id => normalized with { Id = id },
            "Parameter", "operator", input.Id is null ? "created" : "updated",
            JsonSerializer.Serialize(new { before, after = normalized }, Json));
    }

    public async Task<ParameterOption> SaveOption(ParameterOption input)
    {
        var parameter = await repository.Get<TestParameter>("Parameter", input.ParameterId);
        if (parameter is null) throw new ArgumentException($"Parameter {input.ParameterId} was not found.");
        var code = Required(input.Code, "code"); CheckCode(code); var label = Required(input.Label, "label");
        if (await repository.CodeInUse("Option", input.ParameterId, code, input.Id))
            throw new ArgumentException($"An option with code '{code}' already exists for this parameter.");
        Require(input.SortOrder >= 0, "sortOrder must be zero or greater.");
        var before = input.Id is null ? null : await repository.Get<ParameterOption>("Option", input.Id.Value);
        if (before is not null && before.ParameterId != input.ParameterId) throw new ArgumentException("parameterId is immutable on option update.");
        if (input.Id is not null && before is null) throw new KeyNotFoundException($"Option {input.Id} was not found.");
        if (parameter.DataType != "Dropdown" && (before is null || input.Active))
            throw new ArgumentException("Options can only be created or activated for Dropdown parameters.");
        return await repository.Save("Option", input.Id, input.ParameterId, code, input.Active,
            id => input with { Id = id, Code = code, Label = label }, "Option", "operator",
            input.Id is null ? "created" : "updated", JsonSerializer.Serialize(new { before, after = input }, Json));
    }

    private async Task<List<ReferenceInterval>> ReferencesFor(int parameterId) =>
        (await repository.List<ReferenceInterval>("Reference")).Where(r => r.ParameterId == parameterId).ToList();

    private static void ValidateReference(ReferenceInterval r, TestParameter parameter)
    {
        Required(r.Context, "context");
        Require(new[] { "Any", "Male", "Female", "Other" }.Contains(r.Sex), "sex must be Any, Male, Female, or Other.");
        Require(r.AgeFrom is null || r.AgeFrom >= 0, "ageFrom must be zero or greater.");
        Require(r.AgeTo is null || r.AgeTo >= 0, "ageTo must be zero or greater.");
        Require(r.AgeFrom is null || r.AgeTo is null || r.AgeFrom <= r.AgeTo, "ageFrom must not exceed ageTo.");
        Require(r.LowerValue is null || r.UpperValue is null || r.LowerValue <= r.UpperValue, "lowerValue must not exceed upperValue.");
        Require(r.LowerValue is null || r.UpperValue is null || r.LowerValue != r.UpperValue ||
            r.LowerOperator == ">=" && r.UpperOperator == "<=", "Equal reference bounds require inclusive operators.");
        Require(r.CriticalLow is null || r.CriticalHigh is null || r.CriticalLow <= r.CriticalHigh, "criticalLow must not exceed criticalHigh.");
        Require(r.LowerOperator is ">=" or ">" && r.UpperOperator is "<=" or "<", "Invalid range boundary operator.");
        if (parameter.ReferenceType == "Range")
        {
            Require(parameter.DataType == "Numeric", "Range references require a Numeric parameter.");
            Require(r.LowerValue is not null || r.UpperValue is not null, "A Range reference requires a lower or upper bound.");
            Require(r.CriticalLow is null || r.LowerValue is null || r.CriticalLow <= r.LowerValue,
                "criticalLow must not exceed the lower reference bound.");
            Require(r.CriticalHigh is null || r.UpperValue is null || r.CriticalHigh >= r.UpperValue,
                "criticalHigh must not be below the upper reference bound.");
        }
        if (parameter.ReferenceType == "Text")
        {
            Require(parameter.DataType is "Text" or "Dropdown" or "Boolean",
                "Text references require a Text, Dropdown, or Boolean parameter.");
            Required(r.ReferenceText, "referenceText");
            Require(r.LowerValue is null && r.UpperValue is null && r.CriticalLow is null &&
                r.CriticalHigh is null && string.IsNullOrWhiteSpace(r.DecisionType),
                "Text references cannot contain numeric bounds or decision rules.");
        }
        if (parameter.ReferenceType == "Decision Value")
        {
            Require(r.DecisionType is "Above" or "Below" or "Equals", "Decision Value supports decisionType Above, Below, or Equals only.");
            if (r.DecisionType is "Above" or "Equals")
                Require(r.LowerValue is not null && r.UpperValue is null,
                    $"{r.DecisionType} requires lowerValue and forbids upperValue.");
            else
                Require(r.UpperValue is not null && r.LowerValue is null,
                    "Below requires upperValue and forbids lowerValue.");
        }
        else Require(string.IsNullOrWhiteSpace(r.DecisionType), "decisionType is only valid for Decision Value parameters.");
        if (parameter.ReferenceType == "None") throw new ArgumentException("ReferenceInterval cannot be saved for referenceType None.");
        Require(string.Equals(r.Unit?.Trim() ?? "", parameter.Unit?.Trim() ?? "", StringComparison.Ordinal),
            "Reference unit must match parameter unit.");
        Date(r.EffectiveFrom, "effectiveFrom"); Date(r.EffectiveTo, "effectiveTo");
        if (!string.IsNullOrWhiteSpace(r.EffectiveFrom) && !string.IsNullOrWhiteSpace(r.EffectiveTo))
            Require(Date(r.EffectiveFrom, "effectiveFrom") <= EffectiveEnd(r.EffectiveTo),
                "effectiveFrom must not be after effectiveTo.");
    }

    private static DateTimeOffset? Date(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date))
            throw new ArgumentException($"{field} must be a valid date/time.");
        return date;
    }
    private static DateTimeOffset? EffectiveEnd(string? value) =>
        Date(value, "effectiveTo") is DateTimeOffset end && value?.Trim().Length == 10
            ? end.AddDays(1).AddTicks(-1) : Date(value, "effectiveTo");

    public async Task<ReferenceInterval> SaveReference(ReferenceInterval input)
    {
        var parameter = await repository.Get<TestParameter>("Parameter", input.ParameterId);
        if (parameter is null) throw new ArgumentException($"Parameter {input.ParameterId} was not found.");
        input = input with
        {
            LowerOperator = string.IsNullOrWhiteSpace(input.LowerOperator) ? ">=" : input.LowerOperator,
            UpperOperator = string.IsNullOrWhiteSpace(input.UpperOperator) ? "<=" : input.UpperOperator,
            Unit = string.IsNullOrWhiteSpace(input.Unit) ? parameter.Unit : input.Unit,
            Context = input.Context?.Trim() ?? ""
        };
        ValidateReference(input, parameter);
        var versions = await ReferencesFor(input.ParameterId);
        var auditBefore = input.Id is null ? null : versions.FirstOrDefault(x => x.Id == input.Id);
        if (auditBefore is not null && auditBefore.ParameterId != input.ParameterId)
            throw new ArgumentException("parameterId is immutable on reference update.");
        var before = auditBefore;
        if (input.Id is not null && before is null) throw new KeyNotFoundException($"Reference {input.Id} was not found.");
        if (before is not null && before.ApprovedAt is not null)
        {
            var version = (versions.Select(x => x.Version ?? 0).DefaultIfEmpty(0).Max()) + 1;
            input = input with { Id = null, Version = version, ApprovedBy = null, ApprovedAt = null };
            before = null;
        }
        else if (input.Id is null)
        {
            var version = (versions.Select(x => x.Version ?? 0).DefaultIfEmpty(0).Max()) + 1;
            input = input with { Version = version, ApprovedBy = null, ApprovedAt = null };
        }
        else input = input with
        {
            Version = before?.Version ?? (versions.Select(x => x.Version ?? 0).DefaultIfEmpty(0).Max() + 1),
            ApprovedBy = null, ApprovedAt = null
        };
        return await repository.Save("Reference", input.Id, input.ParameterId, input.Version is int versionCode ? $"VERSION:{versionCode}" : null, input.Active,
            id => input with { Id = id, ApprovedAt = null, ApprovedBy = null }, "Reference", "operator",
            input.Id is null ? "version-created" : "updated",
            JsonSerializer.Serialize(new { before = auditBefore, after = input }, Json));
    }

    private static bool Overlap(decimal? a0, decimal? a1, decimal? b0, decimal? b1) =>
        (a1 is null || b0 is null || a1 >= b0) && (b1 is null || a0 is null || b1 >= a0);
    private static bool DateOverlap(ReferenceInterval a, ReferenceInterval b)
    {
        var a0 = Date(a.EffectiveFrom, "effectiveFrom"); var a1 = EffectiveEnd(a.EffectiveTo);
        var b0 = Date(b.EffectiveFrom, "effectiveFrom"); var b1 = EffectiveEnd(b.EffectiveTo);
        return (a1 is null || b0 is null || a1 >= b0) && (b1 is null || a0 is null || b1 >= a0);
    }
    private static bool SameContext(ReferenceInterval a, ReferenceInterval b) =>
        a.ParameterId == b.ParameterId &&
        string.Equals(a.Context?.Trim(), b.Context?.Trim(), StringComparison.OrdinalIgnoreCase) &&
        (string.Equals(a.Sex, b.Sex, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(a.Sex, "Any", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(b.Sex, "Any", StringComparison.OrdinalIgnoreCase)) &&
        Overlap(a.AgeFrom, a.AgeTo, b.AgeFrom, b.AgeTo) && DateOverlap(a, b);

    public async Task<ReferenceInterval> ApproveReference(int id, ApprovalInput input)
    {
        var actor = Actor(input.ApprovedBy, "approvedBy");
        return await repository.InTransaction(async (cn, tx) =>
        {
            var reference = await repository.Get<ReferenceInterval>("Reference", id, cn, tx)
                ?? throw new KeyNotFoundException($"Reference {id} was not found.");
            if (reference.ApprovedAt is not null) throw new ArgumentException("Reference is already approved; create a new version to change it.");
            var parentId = await repository.ParentId("Reference", id, cn, tx);
            if (parentId is null || parentId.Value != reference.ParameterId)
                throw new ArgumentException("Reference parameterId does not match its stored parent.");
            var parameter = await repository.Get<TestParameter>("Parameter", reference.ParameterId, cn, tx)
                ?? throw new ArgumentException($"Reference parameter {reference.ParameterId} was not found.");
            ValidateReference(reference, parameter);
            if (!string.Equals(reference.Unit?.Trim() ?? "", parameter.Unit?.Trim() ?? "", StringComparison.Ordinal))
                throw new ArgumentException("Reference unit no longer matches its parameter; save a corrected version before approval.");
            var conflicts = (await repository.List<ReferenceInterval>("Reference", cn, tx))
                .Where(x => x.Id != id && x.ParameterId == reference.ParameterId && x.Active &&
                    x.ApprovedAt is not null && SameContext(reference, x)).ToList();
            var predecessor = conflicts.Where(x =>
                string.Equals(x.Context?.Trim(), reference.Context?.Trim(), StringComparison.OrdinalIgnoreCase) &&
                string.Equals(x.Sex, reference.Sex, StringComparison.OrdinalIgnoreCase) &&
                x.AgeFrom == reference.AgeFrom && x.AgeTo == reference.AgeTo &&
                Date(x.EffectiveFrom, "effectiveFrom") == Date(reference.EffectiveFrom, "effectiveFrom") &&
                EffectiveEnd(x.EffectiveTo) == EffectiveEnd(reference.EffectiveTo)).ToList();
            if (!reference.Active && predecessor.Count == 0)
                throw new ArgumentException("An inactive reference version can only be approved to retire a matching active approved interval.");
            var ambiguous = conflicts.Except(predecessor).FirstOrDefault();
            if (ambiguous is not null) throw new ArgumentException($"Approval conflicts with active approved reference {ambiguous.Id}; resolve the overlapping context/age/sex/date interval first.");
            foreach (var old in predecessor)
                await repository.UpdateInTransaction(cn, tx, "Reference", old.Id!.Value, old with { Active = false });
            var approved = reference with { ApprovedBy = actor, ApprovedAt = Now() };
            await repository.UpdateInTransaction(cn, tx, "Reference", id, approved);
            await repository.Audit(cn, tx, "Reference", id, "approved", actor,
                JsonSerializer.Serialize(new { before = reference, after = approved, retired = predecessor.Select(x => x.Id) }, Json));
            return approved;
        });
    }

    private static (ReferenceInterval? reference, bool ambiguous) SelectReference(IEnumerable<ReferenceInterval> refs,
        TestParameter parameter, string? context, string sex, decimal age, DateTimeOffset collected)
    {
        var choices = refs.Where(r => r.Active && r.ApprovedAt is not null && r.ParameterId == parameter.Id &&
            string.Equals(r.Context?.Trim(), context?.Trim() ?? "", StringComparison.OrdinalIgnoreCase) &&
            (string.Equals(r.Sex, "Any", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(r.Sex, sex, StringComparison.OrdinalIgnoreCase)) &&
            string.Equals(r.Unit?.Trim() ?? "", parameter.Unit?.Trim() ?? "", StringComparison.Ordinal) &&
            (r.AgeFrom is null || age >= r.AgeFrom) && (r.AgeTo is null || age <= r.AgeTo) &&
            (Date(r.EffectiveFrom, "effectiveFrom") is null || collected >= Date(r.EffectiveFrom, "effectiveFrom"))).ToList();
        choices = choices.Where(r => EffectiveEnd(r.EffectiveTo) is null || collected <= EffectiveEnd(r.EffectiveTo)).ToList();
        return choices.Count switch { 0 => (null, false), 1 => (choices[0], false), _ => (null, true) };
    }

    private static decimal ParseNumeric(string value, string label)
    {
        if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var number))
            throw new ArgumentException($"{label} must be a valid number.");
        return number;
    }

    private static List<ResultValue> ValidateAndEvaluate(List<ResultValue> values, List<TestParameter> parameters,
        List<ParameterOption> options, List<ReferenceInterval> references, LabResult result, bool requireCompleted = false)
    {
        var byId = parameters.Where(p => p.Active).ToDictionary(p => p.Id!.Value);
        if (values.Select(v => v.ParameterId).Distinct().Count() != values.Count)
            throw new ArgumentException("Duplicate parameterIds are not allowed.");
        foreach (var value in values)
            if (!byId.ContainsKey(value.ParameterId)) throw new ArgumentException($"Unknown or inactive parameterId {value.ParameterId}.");
        var collected = Date(result.CollectedAt, "collectedAt") ?? throw new ArgumentException("collectedAt is required.");
        var evaluated = new List<ResultValue>();
        foreach (var parameter in parameters.Where(p => p.Active))
        {
            var value = values.FirstOrDefault(v => v.ParameterId == parameter.Id);
            if (value is null) continue;
            var disposition = value.Disposition;
            if (disposition is not ("Completed" or "Not Done")) throw new ArgumentException("disposition must be Completed or Not Done.");
            Require(value.Value is not null, $"value is required for {parameter.Name}.");
            Require(value.Comment is not null, $"comment is required for {parameter.Name}.");
            if (disposition == "Not Done")
            {
                Required(value.SkipApprovedBy, $"skipApprovedBy for {parameter.Name}", 2);
                Required(value.SkipReason, $"skipReason for {parameter.Name}");
                evaluated.Add(value with { Flag = "", ReferenceText = "Not configured", ReferenceId = null });
                continue;
            }
            var raw = value.Value ?? "";
            if (string.IsNullOrWhiteSpace(raw))
            {
                if (parameter.Required && requireCompleted) throw new ArgumentException($"A value is required for {parameter.Name}.");
                evaluated.Add(value with { Flag = "", ReferenceText = "Not configured", ReferenceId = null });
                continue;
            }
            decimal? numeric = null;
            switch (parameter.DataType)
            {
                case "Numeric":
                    numeric = ParseNumeric(raw, parameter.Name);
                    if (!parameter.AllowNegative && numeric < 0) throw new ArgumentException($"{parameter.Name} cannot be negative.");
                    if (parameter.TechnicalMin is not null && numeric < parameter.TechnicalMin) throw new ArgumentException($"{parameter.Name} is below its technical minimum.");
                    if (parameter.TechnicalMax is not null && numeric > parameter.TechnicalMax) throw new ArgumentException($"{parameter.Name} is above its technical maximum.");
                    if (parameter.DecimalPlaces is int places && decimal.Round(numeric.Value, places) != numeric)
                        throw new ArgumentException($"{parameter.Name} permits at most {places} decimal places.");
                    break;
                case "Boolean":
                    if (!bool.TryParse(raw, out _)) throw new ArgumentException($"{parameter.Name} must be true or false.");
                    break;
                case "Date":
                    if (!DateOnly.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
                        throw new ArgumentException($"{parameter.Name} must be a valid date.");
                    break;
                case "Dropdown":
                    if (!options.Any(o => o.ParameterId == parameter.Id && o.Active && o.Code == raw))
                        throw new ArgumentException($"{parameter.Name} must match an active configured option code.");
                    break;
                case "Text": Required(raw, parameter.Name); break;
            }
            var selected = SelectReference(references, parameter, result.Context, result.Sex, result.Age, collected);
            if (selected.ambiguous) throw new ArgumentException($"Multiple approved reference intervals apply to {parameter.Name}; resolve configuration ambiguity.");
            var reference = selected.reference;
            string flag = "";
            string referenceText = reference?.ReferenceText ?? parameter.DisplayReferenceText ?? "";
            if (reference is null) referenceText = "Not configured";
            if (reference is not null)
            {
                if (numeric is decimal n && parameter.ReferenceType == "Range")
                {
                    var lowerBad = reference.LowerValue is not null && (reference.LowerOperator == ">=" ? n < reference.LowerValue : n <= reference.LowerValue);
                    var upperBad = reference.UpperValue is not null && (reference.UpperOperator == "<=" ? n > reference.UpperValue : n >= reference.UpperValue);
                    if (reference.CriticalLow is not null && n < reference.CriticalLow) flag = "Critical Low";
                    else if (reference.CriticalHigh is not null && n > reference.CriticalHigh) flag = "Critical High";
                    else if (lowerBad) flag = "Low";
                    else if (upperBad) flag = "High";
                    else if (reference.LowerValue is not null || reference.UpperValue is not null) flag = "Within interval";
                }
                else if (parameter.ReferenceType == "Text" && !string.IsNullOrWhiteSpace(reference.ReferenceText))
                {
                    var configured = reference.ReferenceText.Trim();
                    var matches = string.Equals(raw.Trim(), configured, StringComparison.OrdinalIgnoreCase);
                    if (parameter.DataType == "Dropdown")
                    {
                        var optionLabel = options.FirstOrDefault(o => o.ParameterId == parameter.Id &&
                            o.Code == raw && o.Active)?.Label;
                        matches = optionLabel is not null &&
                            string.Equals(optionLabel.Trim(), configured, StringComparison.OrdinalIgnoreCase);
                    }
                    else if (parameter.DataType == "Boolean" && bool.TryParse(raw, out var boolValue))
                        matches = string.Equals(boolValue ? "Yes" : "No", configured, StringComparison.OrdinalIgnoreCase);
                    if (!matches) flag = "Abnormal";
                }
                else if (parameter.ReferenceType == "Decision Value" && numeric is decimal dv)
                {
                    var threshold = reference.LowerValue ?? reference.UpperValue;
                    if (reference.DecisionType == "Above" && threshold is not null && dv > threshold) flag = "H";
                    else if (reference.DecisionType == "Below" && threshold is not null && dv < threshold) flag = "L";
                    else if (reference.DecisionType == "Equals" && threshold is not null && dv != threshold) flag = "Abnormal";
                }
            }
            if (reference is not null && numeric is decimal criticalValue)
            {
                if (reference.CriticalLow is not null && criticalValue < reference.CriticalLow) flag = "Critical Low";
                else if (reference.CriticalHigh is not null && criticalValue > reference.CriticalHigh) flag = "Critical High";
            }
            if (parameter.DataType == "Dropdown" &&
                options.FirstOrDefault(o => o.ParameterId == parameter.Id && o.Code == raw && o.Active)?.Abnormal == true)
                flag = "Abnormal";
            if (reference is not null && parameter.ReferenceType == "Range" && string.IsNullOrWhiteSpace(referenceText))
            {
                var bounds = new List<string>();
                if (reference.LowerValue is not null) bounds.Add($"{reference.LowerOperator}{reference.LowerValue.Value.ToString(CultureInfo.InvariantCulture)}");
                if (reference.UpperValue is not null) bounds.Add($"{reference.UpperOperator}{reference.UpperValue.Value.ToString(CultureInfo.InvariantCulture)}");
                referenceText = string.Join(" and ", bounds) + (string.IsNullOrWhiteSpace(reference.Unit) ? "" : $" {reference.Unit}");
            }
            if (reference is not null && parameter.ReferenceType == "Decision Value" && string.IsNullOrWhiteSpace(referenceText))
            {
                var threshold = reference.LowerValue ?? reference.UpperValue;
                referenceText = $"{reference.DecisionType} {threshold?.ToString(CultureInfo.InvariantCulture)}" +
                    (string.IsNullOrWhiteSpace(reference.Unit) ? "" : $" {reference.Unit}");
            }
            evaluated.Add(value with { Flag = flag, ReferenceText = referenceText, ReferenceId = reference?.Id });
        }
        return evaluated;
    }

    public async Task<LabResult> SaveResult(ResultInput input)
    {
        Required(input.PatientName, "patientName"); Required(input.PatientCode, "patientCode");
        Require(input.Context is not null, "context is required.");
        Require(input.Comment is not null, "comment is required.");
        Require(input.Values is not null, "values is required.");
        Require(input.Age >= 0, "age must be zero or greater.");
        Require(input.Sex is "Male" or "Female" or "Other", "sex must be Male, Female, or Other.");
        Date(input.CollectedAt, "collectedAt");
        var stored = input.Id is null ? null : await repository.Get<StoredResult>("Result", input.Id.Value);
        if (input.Id is not null && stored is null) throw new KeyNotFoundException($"Result {input.Id} was not found.");
        if (stored is not null && stored.Result.Status is "Verified" or "Released")
            throw new ArgumentException("Verified and Released results are immutable.");
        Test test; List<TestParameter> parameters; List<ParameterOption> options; List<ReferenceInterval> refs;
        if (stored is null)
        {
            var configuration = await repository.CaptureTestConfiguration(input.TestId);
            test = configuration.Test;
            if (!test.Active) throw new ArgumentException("Inactive tests cannot be used for new results.");
            parameters = configuration.Parameters;
            options = configuration.Options;
            refs = configuration.References;
        }
        else
        {
            if (stored.Result.TestId != input.TestId) throw new ArgumentException("testId is immutable on result update.");
            test = stored.Test; parameters = stored.Parameters; options = stored.Options; refs = stored.References;
        }
        var resultId = stored?.Result.Id ?? input.Id ?? 0;
        var candidate = new LabResult(resultId, input.TestId, input.PatientName.Trim(), input.PatientCode.Trim(), input.Age,
            input.Sex, input.Context ?? "", input.CollectedAt, input.Comment ?? "", input.Values!, test.Name,
            "Draft", stored?.Result.CreatedAt ?? Now(), Now(), null, null, null);
        var values = ValidateAndEvaluate(input.Values!, parameters, options, refs, candidate);
        candidate = candidate with { Values = values };
        var details = JsonSerializer.Serialize(new { before = stored?.Result, after = candidate }, Json);
        if (stored is null)
        {
            var created = await repository.Save("Result", null, input.TestId, null, true,
                id => new StoredResult(candidate with { Id = id }, test, parameters, options, refs, null),
                "Result", "operator", "created", details);
            return EnrichResult(created);
        }
        if (stored.Result.Status == "Entered") candidate = candidate with { Status = "Draft" };
        var updated = await repository.InTransaction(async (cn, tx) =>
        {
            var latest = await repository.Get<StoredResult>("Result", input.Id!.Value, cn, tx)
                ?? throw new KeyNotFoundException($"Result {input.Id} was not found.");
            if (latest.Result.Status is "Verified" or "Released")
                throw new ArgumentException("Verified and Released results are immutable.");
            if (latest.Result.Status != stored.Result.Status || latest.Result.UpdatedAt != stored.Result.UpdatedAt)
                throw new ArgumentException("Result changed concurrently; reload it before editing.");
            var next = new StoredResult(candidate with { Id = latest.Result.Id }, latest.Test, latest.Parameters,
                latest.Options, latest.References, null);
            await repository.UpdateInTransaction(cn, tx, "Result", latest.Result.Id, next);
            await repository.Audit(cn, tx, "Result", latest.Result.Id, "updated", "operator", details);
            return next;
        });
        return EnrichResult(updated);
    }

    public async Task<List<LabResult>> Results() =>
        (await repository.List<StoredResult>("Result")).Select(EnrichResult).OrderByDescending(x => x.Id).ToList();

    private static LabResult EnrichResult(StoredResult stored) =>
        stored.Result with { Configuration = new ResultConfiguration(stored.Test, stored.Parameters, stored.Options, stored.References) };

    public async Task<LabResult> Transition(int id, TransitionInput input)
    {
        var actor = Actor(input.Actor, "actor");
        return await repository.InTransaction(async (cn, tx) =>
        {
            var stored = await repository.Get<StoredResult>("Result", id, cn, tx)
                ?? throw new KeyNotFoundException($"Result {id} was not found.");
            var current = stored.Result;
            var expected = (current.Status, input.Status) switch
            {
                ("Draft", "Entered") => true,
                ("Entered", "Verified") => true,
                ("Verified", "Released") => true,
                _ => false
            };
            if (!expected) throw new ArgumentException($"Invalid result transition from {current.Status} to {input.Status}.");
            if (input.Status == "Entered")
            {
                var validated = ValidateAndEvaluate(current.Values, stored.Parameters, stored.Options, stored.References, current, true);
                foreach (var p in stored.Parameters.Where(p => p.Active && p.Required))
                    if (!validated.Any(v => v.ParameterId == p.Id)) throw new ArgumentException($"A value or approved Not Done disposition is required for {p.Name}.");
                current = current with { Values = validated };
            }
            if (input.Status == "Verified") current = current with { VerifiedBy = actor };
            var updatedAt = Now();
            current = current with { Status = input.Status, UpdatedAt = updatedAt,
                ReleasedBy = input.Status == "Released" ? actor : current.ReleasedBy,
                ReleasedAt = input.Status == "Released" ? updatedAt : current.ReleasedAt };
            ReportSnapshot? snapshot = stored.Snapshot;
            if (input.Status == "Released")
            {
                if (string.IsNullOrWhiteSpace(current.VerifiedBy)) throw new ArgumentException("A result must be verified before release.");
                snapshot = BuildSnapshot(current, stored, actor, updatedAt);
            }
            var updated = stored with { Result = current, Snapshot = snapshot };
            await repository.UpdateInTransaction(cn, tx, "Result", id, updated);
            await repository.Audit(cn, tx, "Result", id, "transitioned", actor,
                JsonSerializer.Serialize(new { from = stored.Result.Status, to = input.Status }, Json));
            return EnrichResult(updated);
        });
    }

    private static ReportSnapshot BuildSnapshot(LabResult result, StoredResult stored, string actor, string releasedAt)
    {
        var lines = new List<ReportLine>();
        foreach (var p in stored.Parameters.Where(x => x.Active).OrderBy(x => x.DisplayOrder).ThenBy(x => x.Id))
        {
            var value = result.Values.FirstOrDefault(v => v.ParameterId == p.Id);
            value ??= new ResultValue(p.Id!.Value, "", "Completed", null, null, "", "", "Not configured", null);
            var reference = value.ReferenceId is int rid ? stored.References.FirstOrDefault(r => r.Id == rid) : null;
            var option = value.Disposition == "Completed" ? stored.Options.FirstOrDefault(o => o.ParameterId == p.Id && o.Code == value.Value) : null;
            lines.Add(new ReportLine(p.Id!.Value, p.Name, p.Code, p.Unit ?? "", value.Value,
                value.ReferenceText ?? "Not configured", value.Flag ?? "", value.Comment ?? "", value.Disposition,
                p.DisplayOrder, reference, option, value.SkipApprovedBy, value.SkipReason));
        }
        return new ReportSnapshot(result.Id, stored.Test.ReportTitle ?? stored.Test.Name, stored.Test.Name, stored.Test.Code,
            result.PatientName, result.PatientCode, result.Age, result.Sex, result.CollectedAt, releasedAt,
            result.VerifiedBy!, actor, result.Comment ?? "", stored.Test.Notes ?? "", lines);
    }

    public async Task<ReportSnapshot> Report(int id)
    {
        var stored = await repository.Get<StoredResult>("Result", id)
            ?? throw new KeyNotFoundException($"Result {id} was not found.");
        if (stored.Result.Status != "Released" || stored.Snapshot is null) throw new ArgumentException("Report is available only after release.");
        return stored.Snapshot;
    }

    public Task<List<AuditEvent>> Audit() => repository.Audits();
}