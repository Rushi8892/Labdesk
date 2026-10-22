namespace LabDesk.Api;

/// <summary>
/// Input checks shared by the services. These run before anything reaches the
/// database, so a bad request comes back as a clear 400 with a message the
/// interface can show, instead of a driver error.
/// </summary>
internal static class Validate
{
    /// <summary>Codes are capped at 40 characters, matching the columns.</summary>
    public const int CodeLength = 40;

    public static void Code(string? code)
    {
        var value = Required(code, "code");
        Max(value, CodeLength, "code");
    }

    public static string Required(string? value, string field, int min = 1)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Trim().Length < min)
        {
            throw new ArgumentException($"{field} is required.");
        }

        return value.Trim();
    }

    public static void Max(string? value, int length, string field)
    {
        if (value is not null && value.Trim().Length > length)
        {
            throw new ArgumentException($"{field} must be no longer than {length} characters.");
        }
    }

    /// <summary>Blank is stored as NULL rather than as an empty string.</summary>
    public static string? Optional(string? value, int length, string field)
    {
        Max(value, length, field);
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    public static void Require(bool ok, string message)
    {
        if (!ok)
        {
            throw new ArgumentException(message);
        }
    }

    public static void Sex(string sex) =>
        Require(sex is "Male" or "Female" or "Other", "sex must be Male, Female, or Other.");

    /// <summary>
    /// The reference lines a parameter prints. Blank lines are dropped rather than
    /// rejected, so a stray newline in the editor is not an error.
    /// </summary>
    public static string[]? Ranges(IEnumerable<string>? lines)
    {
        var kept = (lines ?? []).Where(line => !string.IsNullOrWhiteSpace(line)).Select(line => line.Trim()).ToList();
        Require(kept.Count <= 10, "normalRanges must hold no more than 10 lines.");
        foreach (var line in kept)
        {
            Max(line, 200, "a normalRanges line");
        }

        return kept.Count == 0 ? null : kept.ToArray();
    }

    public static void Known(bool found, string what, int? id)
    {
        Require(found, $"{what} {id} was not found.");
    }
}
