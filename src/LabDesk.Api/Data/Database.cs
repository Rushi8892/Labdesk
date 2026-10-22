using System.Data;
using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

namespace LabDesk.Api;

/// <summary>
/// The one place that knows how to reach SQL Server. Everything else goes through
/// a repository built on top of this.
/// </summary>
public sealed class Database(IConfiguration configuration)
{
    private readonly string _connectionString = configuration["DB_CONNECTION_STRING"]
        ?? configuration.GetConnectionString("SqlServer")
        ?? throw new InvalidOperationException(
            "Configure ConnectionStrings:SqlServer or DB_CONNECTION_STRING.");

    public async Task<SqlConnection> OpenAsync()
    {
        var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        return connection;
    }

    public async Task<T> InTransactionAsync<T>(Func<SqlConnection, SqlTransaction, Task<T>> work)
    {
        await using var connection = await OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            var result = await work(connection, transaction);
            await transaction.CommitAsync();
            return result;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    /// <summary>Runs a script batch by batch. Both shipped scripts are idempotent.</summary>
    public async Task InitializeAsync(string scriptPath)
    {
        var script = await File.ReadAllTextAsync(scriptPath);
        await using var connection = await OpenAsync();
        foreach (var batch in Sql.Batches(script))
        {
            await using var command = connection.CreateCommand();
            command.CommandText = batch;
            await command.ExecuteNonQueryAsync();
        }
    }
}

internal static class Sql
{
    public static IEnumerable<string> Batches(string script) =>
        Regex.Split(script, @"^\s*GO\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase)
            .Where(batch => !string.IsNullOrWhiteSpace(batch));

    public static void Bind(SqlCommand command, string name, object? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value ?? DBNull.Value;
        // Without this a DateTime is sent as the legacy datetime type, which rounds
        // to about 3ms. That silently breaks the updated_at comparison guarding a draft.
        if (value is DateTime)
        {
            parameter.SqlDbType = SqlDbType.DateTime2;
        }

        command.Parameters.Add(parameter);
    }

    public static string? Text(SqlDataReader reader, int index) =>
        reader.IsDBNull(index) ? null : reader.GetString(index);

    public static int? Int(SqlDataReader reader, int index) =>
        reader.IsDBNull(index) ? null : reader.GetInt32(index);

    public static decimal? Decimal(SqlDataReader reader, int index) =>
        reader.IsDBNull(index) ? null : reader.GetDecimal(index);

    public static bool Flag(SqlDataReader reader, int index) => !reader.IsDBNull(index) && reader.GetBoolean(index);

    /// <summary>
    /// Lines go into the column as they were typed, so the value is readable in
    /// SSMS. The interface escapes every value it renders, so the relaxed encoder
    /// is safe here.
    /// </summary>
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>Packs reference lines for storage as a JSON array of strings.</summary>
    public static string? Json(IReadOnlyList<string>? lines) =>
        lines is null || lines.Count == 0 ? null : JsonSerializer.Serialize(lines, JsonOptions);

    /// <summary>Reads back that array. NULL means the parameter has no references.</summary>
    public static string[] Ranges(SqlDataReader reader, int index)
    {
        var json = Text(reader, index);
        return string.IsNullOrWhiteSpace(json) ? [] : JsonSerializer.Deserialize<string[]>(json) ?? [];
    }

    public static string Utc(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("O");

    /// <summary>
    /// A timestamp from the interface or the database. Without an offset the value
    /// is treated as UTC, which is what the desktop interface has always sent.
    /// </summary>
    public static DateTime ParseUtc(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException($"{field} is required.");
        }

        if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal,
                out var parsed))
        {
            throw new ArgumentException($"{field} must be a valid date/time.");
        }

        return parsed.UtcDateTime;
    }

    public static DateTime? ParseUtcOrNull(string? value, string field) =>
        string.IsNullOrWhiteSpace(value) ? null : ParseUtc(value, field);

    /// <summary>Turns a duplicate-key failure into the message the interface shows.</summary>
    public static ArgumentException Duplicate(string message) => new(message);

    public static bool IsDuplicateKey(SqlException exception) => exception.Number is 2601 or 2627;
}
