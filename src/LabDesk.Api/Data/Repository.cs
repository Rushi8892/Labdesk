using System.Data;
using System.Data.Common;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Npgsql;

namespace LabDesk.Api;

public sealed class Repository
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly string _provider;
    private readonly string _connectionString;

    public Repository()
    {
        _provider = string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("DB_PROVIDER"))
            ? "PostgreSql"
            : Environment.GetEnvironmentVariable("DB_PROVIDER")!;

        if (_provider.Equals("PostgreSql", StringComparison.OrdinalIgnoreCase))
        {
            _provider = "PostgreSql";
            var configured = Environment.GetEnvironmentVariable("DB_CONNECTION_STRING")
                ?? Environment.GetEnvironmentVariable("DATABASE_URL");
            _connectionString = string.IsNullOrWhiteSpace(configured)
                ? BuildPgConnectionString()
                : NormalizePgConnectionString(configured);
        }
        else if (_provider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase))
        {
            _provider = "SqlServer";
            _connectionString = Environment.GetEnvironmentVariable("DB_CONNECTION_STRING")
                ?? throw new InvalidOperationException("DB_CONNECTION_STRING is required when DB_PROVIDER=SqlServer.");
        }
        else
        {
            throw new InvalidOperationException("DB_PROVIDER must be PostgreSql or SqlServer.");
        }

        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            throw new InvalidOperationException("A database connection string is required.");
        }
    }

    public string Provider => _provider;

    private string TimestampSql => _provider == "SqlServer" ? "SYSUTCDATETIME()" : "CURRENT_TIMESTAMP";

    public DbConnection NewConnection() => _provider == "SqlServer"
        ? new SqlConnection(_connectionString)
        : new NpgsqlConnection(_connectionString);

    private static string BuildPgConnectionString()
    {
        var host = Environment.GetEnvironmentVariable("PGHOST");
        var database = Environment.GetEnvironmentVariable("PGDATABASE");
        var user = Environment.GetEnvironmentVariable("PGUSER");
        var password = Environment.GetEnvironmentVariable("PGPASSWORD");

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(database) ||
            string.IsNullOrWhiteSpace(user))
        {
            return "";
        }

        return new NpgsqlConnectionStringBuilder
        {
            Host = host,
            Port = int.TryParse(Environment.GetEnvironmentVariable("PGPORT"), out var port) ? port : 5432,
            Database = database,
            Username = user,
            Password = password ?? "",
            SslMode = SslMode.Prefer
        }.ConnectionString;
    }

    private static string NormalizePgConnectionString(string value)
    {
        if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
            !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return value;
        }

        var uri = new Uri(value);
        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort ? 5432 : uri.Port,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "",
            SslMode = SslMode.Prefer
        };

        foreach (var item in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var pair = item.Split('=', 2);
            if (pair[0].Equals("sslmode", StringComparison.OrdinalIgnoreCase) &&
                pair.Length > 1 && Enum.TryParse<SslMode>(pair[1], true, out var sslMode))
            {
                builder.SslMode = sslMode;
            }
        }

        return builder.ConnectionString;
    }

    public static async Task InitializeAsync(string provider, string scriptPath)
    {
        var repository = new Repository();
        if (!repository.Provider.Equals(provider, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("DB_PROVIDER and requested schema provider do not match.");
        }

        var script = await File.ReadAllTextAsync(scriptPath);
        await using var connection = repository.NewConnection();
        await connection.OpenAsync();
        var batches = provider == "SqlServer"
            ? System.Text.RegularExpressions.Regex.Split(script,
                @"^\s*GO\s*$",
                System.Text.RegularExpressions.RegexOptions.Multiline |
                System.Text.RegularExpressions.RegexOptions.IgnoreCase)
            : [script];

        foreach (var batch in batches.Where(batch => !string.IsNullOrWhiteSpace(batch)))
        {
            await using var command = connection.CreateCommand();
            command.CommandText = batch;
            await command.ExecuteNonQueryAsync();
        }
    }

    public async Task<List<T>> List<T>(string kind, DbConnection? connection = null, DbTransaction? transaction = null)
    {
        var ownsConnection = connection is null;
        connection ??= NewConnection();
        if (ownsConnection)
        {
            await connection.OpenAsync();
        }

        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT payload FROM lab_entity WHERE entity_kind=@p0 ORDER BY id";
        Add(command, "@p0", kind);
        var output = new List<T>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            output.Add(JsonSerializer.Deserialize<T>(reader.GetString(0), Json)!);
        }

        if (ownsConnection)
        {
            await connection.DisposeAsync();
        }

        return output;
    }

    public async Task<T?> Get<T>(string kind, int id, DbConnection? connection = null, DbTransaction? transaction = null)
    {
        var ownsConnection = connection is null;
        connection ??= NewConnection();
        if (ownsConnection)
        {
            await connection.OpenAsync();
        }

        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT payload FROM lab_entity WHERE entity_kind=@p0 AND id=@p1";
        Add(command, "@p0", kind);
        Add(command, "@p1", id);
        var value = await command.ExecuteScalarAsync();
        if (ownsConnection)
        {
            await connection.DisposeAsync();
        }

        return value is string text ? JsonSerializer.Deserialize<T>(text, Json) : default;
    }

    public async Task<bool> CodeInUse(string kind, int parentId, string code, int? excludingId)
    {
        await using var connection = NewConnection();
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id FROM lab_entity WHERE entity_kind=@p0 AND parent_id=@p1 " +
            "AND code_key=@p2 AND (@p3 IS NULL OR id<>@p3)";
        Add(command, "@p0", kind);
        Add(command, "@p1", parentId);
        Add(command, "@p2", code.ToUpperInvariant());

        var excluded = command.CreateParameter();
        excluded.ParameterName = "@p3";
        excluded.DbType = DbType.Int32;
        excluded.Value = excludingId is int id ? id : DBNull.Value;
        command.Parameters.Add(excluded);
        return await command.ExecuteScalarAsync() is not null;
    }

    public async Task<int?> ParentId(string kind, int id, DbConnection connection, DbTransaction transaction)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT parent_id FROM lab_entity WHERE entity_kind=@p0 AND id=@p1";
        Add(command, "@p0", kind);
        Add(command, "@p1", id);
        var value = await command.ExecuteScalarAsync();
        return value is null or DBNull ? null : Convert.ToInt32(value);
    }

    public async Task<T> Save<T>(
        string kind,
        int? id,
        int parentId,
        string? code,
        bool active,
        Func<int, T> build,
        string auditEntity,
        string actor,
        string action,
        string details)
    {
        await using var connection = NewConnection();
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable);

        try
        {
            int entityId;
            if (id is null)
            {
                await using var insert = connection.CreateCommand();
                insert.Transaction = transaction;
                insert.CommandText = _provider == "SqlServer"
                    ? $"INSERT INTO lab_entity(entity_kind,parent_id,code_key,is_active,payload,created_at,updated_at) " +
                      $"OUTPUT INSERTED.id VALUES(@p0,@p1,@p2,@p3,'{{}}',{TimestampSql},{TimestampSql})"
                    : $"INSERT INTO lab_entity(entity_kind,parent_id,code_key,is_active,payload,created_at,updated_at) " +
                      $"VALUES(@p0,@p1,@p2,@p3,'{{}}',{TimestampSql},{TimestampSql}) RETURNING id";
                Add(insert, "@p0", kind);
                Add(insert, "@p1", parentId);
                Add(insert, "@p2", code?.ToUpperInvariant());
                Add(insert, "@p3", active);
                entityId = Convert.ToInt32(await insert.ExecuteScalarAsync());
            }
            else
            {
                entityId = id.Value;
                await using var check = connection.CreateCommand();
                check.Transaction = transaction;
                check.CommandText = "SELECT id FROM lab_entity WHERE entity_kind=@p0 AND id=@p1";
                Add(check, "@p0", kind);
                Add(check, "@p1", entityId);
                if (await check.ExecuteScalarAsync() is null)
                {
                    throw new KeyNotFoundException($"{kind} {entityId} was not found.");
                }
            }

            var entity = build(entityId);
            await using var save = connection.CreateCommand();
            save.Transaction = transaction;
            save.CommandText = id is null
                ? $"UPDATE lab_entity SET parent_id=@p0,code_key=@p1,is_active=@p2,payload=@p3," +
                  $"updated_at={TimestampSql} WHERE entity_kind=@p4 AND id=@p5"
                : $"UPDATE lab_entity SET code_key=@p1,is_active=@p2,payload=@p3," +
                  $"updated_at={TimestampSql} WHERE entity_kind=@p4 AND id=@p5";
            Add(save, "@p0", parentId);
            Add(save, "@p1", code?.ToUpperInvariant());
            Add(save, "@p2", active);
            Add(save, "@p3", JsonSerializer.Serialize(entity, Json));
            Add(save, "@p4", kind);
            Add(save, "@p5", entityId);
            await save.ExecuteNonQueryAsync();
            await Audit(connection, transaction, auditEntity, entityId, action, actor, details);
            await transaction.CommitAsync();
            return entity;
        }
        catch (Exception exception)
        {
            await transaction.RollbackAsync();
            if (exception is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } ||
                exception is SqlException sqlException && sqlException.Number is 2601 or 2627)
            {
                throw new ArgumentException("The code or reference version is already in use.");
            }

            throw;
        }
    }

    public async Task AuditOnly(string entity, int entityId, string action, string actor, string details)
    {
        await using var connection = NewConnection();
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable);
        await Audit(connection, transaction, entity, entityId, action, actor, details);
        await transaction.CommitAsync();
    }

    public async Task<List<AuditEvent>> Audits()
    {
        await using var connection = NewConnection();
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id,entity_name,entity_id,action_name,actor,created_at,details " +
            "FROM lab_audit ORDER BY id DESC";
        await using var reader = await command.ExecuteReaderAsync();
        var result = new List<AuditEvent>();
        while (await reader.ReadAsync())
        {
            result.Add(new AuditEvent(reader.GetInt32(0), reader.GetString(1), reader.GetInt32(2),
                reader.GetString(3), reader.GetString(4),
                DateTime.SpecifyKind(reader.GetDateTime(5), DateTimeKind.Utc).ToString("O"), reader.GetString(6)));
        }

        return result;
    }

    public async Task<T> InTransaction<T>(Func<DbConnection, DbTransaction, Task<T>> work)
    {
        await using var connection = NewConnection();
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable);
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

    public Task<(Test Test, List<TestParameter> Parameters, List<ParameterOption> Options,
        List<ReferenceInterval> References)> CaptureTestConfiguration(int testId) =>
        InTransaction(async (connection, transaction) =>
        {
            var test = await Get<Test>("Test", testId, connection, transaction)
                ?? throw new ArgumentException($"Test {testId} was not found.");
            var parameters = (await List<TestParameter>("Parameter", connection, transaction))
                .Where(parameter => parameter.TestId == testId)
                .ToList();
            var ids = parameters.Select(parameter => parameter.Id).ToHashSet();
            var options = (await List<ParameterOption>("Option", connection, transaction))
                .Where(option => ids.Contains(option.ParameterId))
                .ToList();
            var references = (await List<ReferenceInterval>("Reference", connection, transaction))
                .Where(reference => ids.Contains(reference.ParameterId))
                .ToList();
            return (test, parameters, options, references);
        });

    public async Task UpdateInTransaction<T>(
        DbConnection connection,
        DbTransaction transaction,
        string kind,
        int id,
        T value)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = $"UPDATE lab_entity SET payload=@p0,updated_at={TimestampSql} " +
            "WHERE entity_kind=@p1 AND id=@p2";
        Add(command, "@p0", JsonSerializer.Serialize(value, Json));
        Add(command, "@p1", kind);
        Add(command, "@p2", id);
        if (await command.ExecuteNonQueryAsync() != 1)
        {
            throw new KeyNotFoundException($"{kind} {id} was not found.");
        }
    }

    public async Task Audit(
        DbConnection connection,
        DbTransaction transaction,
        string entity,
        int id,
        string action,
        string actor,
        string details)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = $"INSERT INTO lab_audit(entity_name,entity_id,action_name,actor,created_at,details) " +
            $"VALUES(@p0,@p1,@p2,@p3,{TimestampSql},@p4)";
        Add(command, "@p0", entity);
        Add(command, "@p1", id);
        Add(command, "@p2", action);
        Add(command, "@p3", actor);
        Add(command, "@p4", details);
        await command.ExecuteNonQueryAsync();
    }

    public static void Add(DbCommand command, string name, object? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value ?? DBNull.Value;
        command.Parameters.Add(parameter);
    }
}
