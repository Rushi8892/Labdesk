using System.Globalization;

namespace LabDesk.Api;

/// <summary>
/// Results: what the technologist typed, and the report frozen at completion.
///
/// References are lines of text on the parameter, copied onto the value and into
/// the report so a completed report prints what was configured then. Nothing here
/// compares a value against a range, so no result carries a flag.
/// </summary>
public sealed class ResultService(ResultRepository results, CatalogRepository catalog, PatientRepository patients)
{
    public Task<List<LabResult>> ResultsAsync() => results.ResultsAsync();

    public async Task<ReportSnapshot> ReportAsync(int id)
    {
        var row = await results.RowAsync(id) ?? throw new KeyNotFoundException($"Result {id} was not found.");
        Validate.Require(row.Status == "Completed", "The report is available only after the result is completed.");
        return await results.SnapshotAsync(id) ?? throw new KeyNotFoundException($"Result {id} has no report.");
    }

    public async Task<LabResult> SaveResultAsync(ResultInput input)
    {
        var test = await catalog.TestAsync(input.TestId)
            ?? throw new KeyNotFoundException($"Test {input.TestId} was not found.");
        var patient = await patients.PatientAsync(input.PatientId)
            ?? throw new KeyNotFoundException($"Patient {input.PatientId} was not found.");
        var existing = input.Id is null
            ? null
            : await results.RowAsync(input.Id.Value) ?? throw new KeyNotFoundException($"Result {input.Id} was not found.");

        if (existing is not null)
        {
            Validate.Require(existing.Status == "Draft", "A completed result cannot be edited.");
            Validate.Require(existing.TestId == input.TestId, "testId is immutable on result update.");
            Validate.Require(existing.PatientId == input.PatientId, "patientId is immutable on result update.");
        }
        else
        {
            Validate.Require(test.Active, "An inactive test cannot be used for a new result.");
        }

        var parameters = (await catalog.ParametersAsync(test.Id)).Where(parameter => parameter.Active).ToList();
        var options = (await catalog.OptionsAsync()).Where(option => option.Active).ToList();
        var values = Evaluate(input, parameters, options);

        var created = existing is null ? Sql.Utc(DateTime.UtcNow) : Sql.Utc(existing.CreatedAt);
        var updated = Sql.Utc(DateTime.UtcNow);
        var result = new LabResult(existing?.Id ?? 0, patient.Id!.Value, patient.Name, patient.Age, patient.Sex,
            patient.DoctorName, test.Id!.Value, test.Name,
            Sql.Utc(Sql.ParseUtc(input.CollectedAt, "collectedAt")), values,
            input.Complete ? "Completed" : "Draft", created, updated, input.Complete ? updated : null);

        var snapshot = input.Complete
            ? new ReportSnapshot(result.Id, test.ReportTitle ?? test.Name, test.Name, test.Code, patient.Name,
                patient.Age, patient.Sex, patient.DoctorName, result.CollectedAt, updated,
                Lines(parameters, values, options))
            : null;

        var note = AuditRepository.Note(
            existing is null ? "created" : input.Complete ? "completed" : "updated",
            new { before = existing, after = new { result.Id, result.Status, values } });
        return await results.SaveAsync(result, values, snapshot, existing, note);
    }

    /// <summary>
    /// Values for parameters that are not part of this test, or that have been
    /// retired, are dropped rather than rejected: a draft saved before a
    /// parameter was switched off must still open and save again.
    /// </summary>
    private static List<ResultValue> Evaluate(ResultInput input, List<TestParameter> parameters,
        List<ParameterOption> options)
    {
        var sent = (input.Values ?? []).GroupBy(value => value.ParameterId)
            .ToDictionary(group => group.Key, group => group.First().Value);
        var evaluated = new List<ResultValue>();
        foreach (var parameter in parameters)
        {
            if (!sent.TryGetValue(parameter.Id!.Value, out var posted))
            {
                continue;
            }

            var raw = (posted ?? string.Empty).Trim();
            if (raw.Length == 0)
            {
                evaluated.Add(new ResultValue(parameter.Id.Value, null, parameter.NormalRanges));
                continue;
            }

            var option = parameter.DataType == "Dropdown" ? FindOption(parameter, options, raw) : null;
            CheckValue(parameter, raw, option);
            evaluated.Add(new ResultValue(parameter.Id.Value, raw, parameter.NormalRanges));
        }

        if (input.Complete)
        {
            var missing = parameters
                .Where(parameter => parameter.Required &&
                    !evaluated.Any(value => value.ParameterId == parameter.Id && value.Value is not null))
                .Select(parameter => parameter.Name)
                .ToList();
            Validate.Require(missing.Count == 0, $"Required before completing: {string.Join(", ", missing)}.");
        }

        return evaluated;
    }

    private static ParameterOption? FindOption(TestParameter parameter, List<ParameterOption> options, string raw) =>
        options.FirstOrDefault(option =>
            option.ParameterId == parameter.Id && option.Code.Equals(raw, StringComparison.OrdinalIgnoreCase));

    /// <summary>Rejects anything the parameter's own rules disallow.</summary>
    private static void CheckValue(TestParameter parameter, string raw, ParameterOption? option)
    {
        switch (parameter.DataType)
        {
            case "Numeric":
                if (!decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out var number))
                {
                    throw new ArgumentException($"{parameter.Name} must be a number.");
                }

                if (!parameter.AllowNegative && number < 0)
                {
                    throw new ArgumentException($"{parameter.Name} cannot be negative.");
                }

                if (parameter.TechnicalMin is decimal minimum && number < minimum)
                {
                    throw new ArgumentException($"{parameter.Name} is below its technical minimum of {minimum}.");
                }

                if (parameter.TechnicalMax is decimal maximum && number > maximum)
                {
                    throw new ArgumentException($"{parameter.Name} is above its technical maximum of {maximum}.");
                }

                if (parameter.DecimalPlaces is int places && decimal.Round(number, places) != number)
                {
                    throw new ArgumentException($"{parameter.Name} allows at most {places} decimal places.");
                }

                return;
            case "Boolean":
                var yesNo = raw.Equals("Yes", StringComparison.OrdinalIgnoreCase) ||
                    raw.Equals("No", StringComparison.OrdinalIgnoreCase);
                if (!yesNo && !bool.TryParse(raw, out _))
                {
                    throw new ArgumentException($"{parameter.Name} must be Yes or No.");
                }

                return;
            case "Date":
                if (!DateOnly.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
                {
                    throw new ArgumentException($"{parameter.Name} must be a date, for example 2026-10-18.");
                }

                return;
            case "Dropdown":
                if (option is null)
                {
                    throw new ArgumentException($"{parameter.Name} must be one of its configured options.");
                }

                return;
            default:
                return;
        }
    }

    /// <summary>What the printed report shows, taken from the values just stored.</summary>
    private static List<ReportLine> Lines(List<TestParameter> parameters, List<ResultValue> values,
        List<ParameterOption> options)
    {
        var byParameter = values.ToDictionary(value => value.ParameterId);
        return parameters
            .Where(parameter => byParameter.ContainsKey(parameter.Id!.Value))
            .Select(parameter =>
            {
                var value = byParameter[parameter.Id!.Value];
                var option = options.FirstOrDefault(candidate =>
                    candidate.ParameterId == parameter.Id && candidate.Code == value.Value);
                return new ReportLine(parameter.Name, parameter.Code, parameter.Unit, value.Value,
                    value.NormalRanges ?? [], parameter.DisplayOrder, option?.Label);
            })
            .ToList();
    }
}
