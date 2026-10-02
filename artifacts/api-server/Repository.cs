using System.Data;
using System.Data.Common;
using System.Text.Json;
using Npgsql;
using Microsoft.Data.SqlClient;

namespace LabDesk.Api;

public sealed class Repository
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly string provider;
    private readonly string connectionString;

    public Repository()
    {
        provider = string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("DB_PROVIDER"))
            ? "PostgreSql" : Environment.GetEnvironmentVariable("DB_PROVIDER")!;
        if (provider.Equals("PostgreSql", StringComparison.OrdinalIgnoreCase))
        {
            provider = "PostgreSql";
            var configured = Environment.GetEnvironmentVariable("DB_CONNECTION_STRING")
                ?? Environment.GetEnvironmentVariable("DATABASE_URL");
            connectionString = string.IsNullOrWhiteSpace(configured) ? BuildPgConnectionString() : NormalizePgConnectionString(configured);
        }
        else if (provider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase))
        {
            provider = "SqlServer";
            connectionString = Environment.GetEnvironmentVariable("DB_CONNECTION_STRING")
                ?? throw new InvalidOperationException("DB_CONNECTION_STRING is required when DB_PROVIDER=SqlServer.");
        }
        else throw new InvalidOperationException("DB_PROVIDER must be PostgreSql or SqlServer.");
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException("A database connection string is required.");
    }

    public string Provider => provider;
    private string TimestampSql => provider == "SqlServer" ? "SYSUTCDATETIME()" : "CURRENT_TIMESTAMP";
    public DbConnection NewConnection() => provider == "SqlServer"
        ? new SqlConnection(connectionString) : new NpgsqlConnection(connectionString);

    private static string BuildPgConnectionString()
    {
        var host = Environment.GetEnvironmentVariable("PGHOST");
        var database = Environment.GetEnvironmentVariable("PGDATABASE");
        var user = Environment.GetEnvironmentVariable("PGUSER");
        var password = Environment.GetEnvironmentVariable("PGPASSWORD");
        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(database) || string.IsNullOrWhiteSpace(user))
            return "";
        return new NpgsqlConnectionStringBuilder { Host = host, Port = int.TryParse(Environment.GetEnvironmentVariable("PGPORT"), out var port) ? port : 5432,
            Database = database, Username = user, Password = password ?? "", SslMode = SslMode.Prefer }.ConnectionString;
    }

    private static string NormalizePgConnectionString(string value)
    {
        if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
            !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase)) return value;
        var uri = new Uri(value);
        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host, Port = uri.IsDefaultPort ? 5432 : uri.Port,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "",
            SslMode = SslMode.Prefer
        };
        foreach (var item in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var pair = item.Split('=', 2);
            if (pair[0].Equals("sslmode", StringComparison.OrdinalIgnoreCase) && pair.Length > 1 &&
                Enum.TryParse<SslMode>(pair[1], true, out var sslMode)) builder.SslMode = sslMode;
        }
        return builder.ConnectionString;
    }

    public static async Task InitializeAsync(string provider, string scriptPath)
    {
        var repo = new Repository();
        if (!repo.Provider.Equals(provider, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("DB_PROVIDER and requested schema provider do not match.");
        var script = await File.ReadAllTextAsync(scriptPath);
        await using var cn = repo.NewConnection();
        await cn.OpenAsync();
        var batches = provider == "SqlServer"
            ? System.Text.RegularExpressions.Regex.Split(script, @"^\s*GO\s*$", System.Text.RegularExpressions.RegexOptions.Multiline | System.Text.RegularExpressions.RegexOptions.IgnoreCase)
            : [script];
        foreach (var batch in batches.Where(x => !string.IsNullOrWhiteSpace(x)))
        {
            await using var cmd = cn.CreateCommand();
            cmd.CommandText = batch;
            await cmd.ExecuteNonQueryAsync();
        }
    }

    public async Task<List<T>> List<T>(string kind, DbConnection? cn = null, DbTransaction? tx = null)
    {
        var own = cn is null;
        cn ??= NewConnection();
        if (own) await cn.OpenAsync();
        await using var cmd = cn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = "SELECT payload FROM lab_entity WHERE entity_kind=@p0 ORDER BY id";
        Add(cmd, "@p0", kind);
        var output = new List<T>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync()) output.Add(JsonSerializer.Deserialize<T>(reader.GetString(0), Json)!);
        if (own) await cn.DisposeAsync();
        return output;
    }

    public async Task<T?> Get<T>(string kind, int id, DbConnection? cn = null, DbTransaction? tx = null)
    {
        var own = cn is null;
        cn ??= NewConnection();
        if (own) await cn.OpenAsync();
        await using var cmd = cn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = "SELECT payload FROM lab_entity WHERE entity_kind=@p0 AND id=@p1";
        Add(cmd, "@p0", kind); Add(cmd, "@p1", id);
        var value = await cmd.ExecuteScalarAsync();
        if (own) await cn.DisposeAsync();
        return value is string text ? JsonSerializer.Deserialize<T>(text, Json) : default;
    }

    public async Task<bool> CodeInUse(string kind, int parentId, string code, int? excludingId)
    {
        await using var cn = NewConnection(); await cn.OpenAsync();
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "SELECT id FROM lab_entity WHERE entity_kind=@p0 AND parent_id=@p1 AND code_key=@p2 AND (@p3 IS NULL OR id<>@p3)";
        Add(cmd, "@p0", kind); Add(cmd, "@p1", parentId); Add(cmd, "@p2", code.ToUpperInvariant());
        var excluded = cmd.CreateParameter();
        excluded.ParameterName = "@p3";
        excluded.DbType = DbType.Int32;
        excluded.Value = excludingId is int id ? id : DBNull.Value;
        cmd.Parameters.Add(excluded);
        return await cmd.ExecuteScalarAsync() is not null;
    }

    public async Task<int?> ParentId(string kind, int id, DbConnection cn, DbTransaction tx)
    {
        await using var cmd = cn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = "SELECT parent_id FROM lab_entity WHERE entity_kind=@p0 AND id=@p1";
        Add(cmd, "@p0", kind); Add(cmd, "@p1", id);
        var value = await cmd.ExecuteScalarAsync();
        return value is null or DBNull ? null : Convert.ToInt32(value);
    }

    public async Task<T> Save<T>(string kind, int? id, int parentId, string? code, bool active, Func<int, T> build,
        string auditEntity, string actor, string action, string details)
    {
        await using var cn = NewConnection();
        await cn.OpenAsync();
        await using var tx = await cn.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            int entityId;
            if (id is null)
            {
                await using var insert = cn.CreateCommand(); insert.Transaction = tx;
                insert.CommandText = provider == "SqlServer"
                    ? $"INSERT INTO lab_entity(entity_kind,parent_id,code_key,is_active,payload,created_at,updated_at) OUTPUT INSERTED.id VALUES(@p0,@p1,@p2,@p3,'{{}}',{TimestampSql},{TimestampSql})"
                    : $"INSERT INTO lab_entity(entity_kind,parent_id,code_key,is_active,payload,created_at,updated_at) VALUES(@p0,@p1,@p2,@p3,'{{}}',{TimestampSql},{TimestampSql}) RETURNING id";
                Add(insert, "@p0", kind); Add(insert, "@p1", parentId); Add(insert, "@p2", code?.ToUpperInvariant()); Add(insert, "@p3", active);
                entityId = Convert.ToInt32(await insert.ExecuteScalarAsync());
            }
            else
            {
                entityId = id.Value;
                await using var check = cn.CreateCommand(); check.Transaction = tx;
                check.CommandText = "SELECT id FROM lab_entity WHERE entity_kind=@p0 AND id=@p1";
                Add(check, "@p0", kind); Add(check, "@p1", entityId);
                if (await check.ExecuteScalarAsync() is null) throw new KeyNotFoundException($"{kind} {entityId} was not found.");
            }
            var entity = build(entityId);
            await using var save = cn.CreateCommand(); save.Transaction = tx;
            if (id is null)
                save.CommandText = $"UPDATE lab_entity SET parent_id=@p0,code_key=@p1,is_active=@p2,payload=@p3,updated_at={TimestampSql} WHERE entity_kind=@p4 AND id=@p5";
            else
                save.CommandText = $"UPDATE lab_entity SET code_key=@p1,is_active=@p2,payload=@p3,updated_at={TimestampSql} WHERE entity_kind=@p4 AND id=@p5";
            Add(save, "@p0", parentId); Add(save, "@p1", code?.ToUpperInvariant()); Add(save, "@p2", active);
            Add(save, "@p3", JsonSerializer.Serialize(entity, Json)); Add(save, "@p4", kind); Add(save, "@p5", entityId);
            await save.ExecuteNonQueryAsync();
            await Audit(cn, tx, auditEntity, entityId, action, actor, details);
            await tx.CommitAsync();
            return entity;
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync();
            if (ex is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } ||
                ex is SqlException sql && sql.Number is 2601 or 2627)
                throw new ArgumentException("The code or reference version is already in use.");
            throw;
        }
    }

    public async Task AuditOnly(string entity, int entityId, string action, string actor, string details)
    {
        await using var cn = NewConnection(); await cn.OpenAsync();
        await using var tx = await cn.BeginTransactionAsync(IsolationLevel.Serializable);
        await Audit(cn, tx, entity, entityId, action, actor, details);
        await tx.CommitAsync();
    }

    public async Task<List<AuditEvent>> Audits()
    {
        await using var cn = NewConnection(); await cn.OpenAsync();
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = "SELECT id,entity_name,entity_id,action_name,actor,created_at,details FROM lab_audit ORDER BY id DESC";
        await using var r = await cmd.ExecuteReaderAsync();
        var result = new List<AuditEvent>();
        while (await r.ReadAsync()) result.Add(new AuditEvent(r.GetInt32(0), r.GetString(1), r.GetInt32(2),
            r.GetString(3), r.GetString(4), DateTime.SpecifyKind(r.GetDateTime(5), DateTimeKind.Utc).ToString("O"), r.GetString(6)));
        return result;
    }

    public async Task<T> InTransaction<T>(Func<DbConnection, DbTransaction, Task<T>> work)
    {
        await using var cn = NewConnection(); await cn.OpenAsync();
        await using var tx = await cn.BeginTransactionAsync(IsolationLevel.Serializable);
        try { var result = await work(cn, tx); await tx.CommitAsync(); return result; }
        catch { await tx.RollbackAsync(); throw; }
    }

    public Task<(Test Test, List<TestParameter> Parameters, List<ParameterOption> Options,
        List<ReferenceInterval> References)> CaptureTestConfiguration(int testId) =>
        InTransaction(async (cn, tx) =>
        {
            var test = await Get<Test>("Test", testId, cn, tx)
                ?? throw new ArgumentException($"Test {testId} was not found.");
            var parameters = (await List<TestParameter>("Parameter", cn, tx)).Where(p => p.TestId == testId).ToList();
            var ids = parameters.Select(p => p.Id).ToHashSet();
            return (test, parameters,
                (await List<ParameterOption>("Option", cn, tx)).Where(o => ids.Contains(o.ParameterId)).ToList(),
                (await List<ReferenceInterval>("Reference", cn, tx)).Where(r => ids.Contains(r.ParameterId)).ToList());
        });

    public async Task UpdateInTransaction<T>(DbConnection cn, DbTransaction tx, string kind, int id, T value)
    {
        await using var cmd = cn.CreateCommand(); cmd.Transaction = tx;
        cmd.CommandText = $"UPDATE lab_entity SET payload=@p0,updated_at={TimestampSql} WHERE entity_kind=@p1 AND id=@p2";
        Add(cmd, "@p0", JsonSerializer.Serialize(value, Json)); Add(cmd, "@p1", kind); Add(cmd, "@p2", id);
        if (await cmd.ExecuteNonQueryAsync() != 1) throw new KeyNotFoundException($"{kind} {id} was not found.");
    }

    public async Task Audit(DbConnection cn, DbTransaction tx, string entity, int id, string action, string actor, string details)
    {
        await using var cmd = cn.CreateCommand(); cmd.Transaction = tx;
        cmd.CommandText = $"INSERT INTO lab_audit(entity_name,entity_id,action_name,actor,created_at,details) VALUES(@p0,@p1,@p2,@p3,{TimestampSql},@p4)";
        Add(cmd, "@p0", entity); Add(cmd, "@p1", id); Add(cmd, "@p2", action); Add(cmd, "@p3", actor); Add(cmd, "@p4", details);
        await cmd.ExecuteNonQueryAsync();
    }

    public static void Add(DbCommand cmd, string name, object? value)
    {
        var p = cmd.CreateParameter(); p.ParameterName = name; p.Value = value ?? DBNull.Value; cmd.Parameters.Add(p);
    }
}