using Microsoft.Data.SqlClient;
using System.Text.Json;

namespace LabDesk.Api;

/// <summary>Append-only audit trail. Every save writes one row in its own transaction.</summary>
public sealed class AuditRepository(Database database)
{
    // There is no sign-in yet: the interface is a single workbench.
    public const string LocalActor = "operator";

    public async Task WriteAsync(SqlConnection connection, SqlTransaction transaction, string entity, int entityId,
        string action, string actor, string details)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            "INSERT INTO lab_audit (entity_name, entity_id, action_name, actor, created_at, details) " +
            "VALUES (@entity, @entityId, @action, @actor, SYSUTCDATETIME(), @details)";
        Sql.Bind(command, "@entity", entity);
        Sql.Bind(command, "@entityId", entityId);
        Sql.Bind(command, "@action", action);
        Sql.Bind(command, "@actor", actor);
        Sql.Bind(command, "@details", details);
        await command.ExecuteNonQueryAsync();
    }

    public async Task<List<AuditEvent>> ListAsync()
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, entity_name, entity_id, action_name, actor, created_at, details " +
            "FROM lab_audit ORDER BY id DESC";
        await using var reader = await command.ExecuteReaderAsync();
        var events = new List<AuditEvent>();
        while (await reader.ReadAsync())
        {
            events.Add(new AuditEvent(reader.GetInt32(0), reader.GetString(1), reader.GetInt32(2), reader.GetString(3),
                reader.GetString(4), Sql.Utc(reader.GetDateTime(5)), reader.GetString(6)));
        }

        return events;
    }

    public static AuditNote Note(string action, object details) =>
        new(action, JsonSerializer.Serialize(details, Json));

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
}
