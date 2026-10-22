using Microsoft.Data.SqlClient;

namespace LabDesk.Api;

/// <summary>The stored state of one result, used to check concurrency and immutability.</summary>
public sealed record ResultRow(int Id, int PatientId, int TestId, DateTime CollectedAt, string Status,
    DateTime CreatedAt, DateTime UpdatedAt, DateTime? CompletedAt);

/// <summary>
/// Results, the values entered against them, and the report that is frozen when a
/// result is completed.
/// </summary>
public sealed class ResultRepository(Database database, AuditRepository audit)
{
    private const string ResultSelect = "SELECT r.id, r.patient_id, p.name, p.age, p.sex, d.name, r.test_id, t.name, " +
        "r.collected_at, r.status, r.created_at, r.updated_at, r.completed_at FROM dbo.lab_result r " +
        "JOIN dbo.patient p ON p.id = r.patient_id JOIN dbo.test t ON t.id = r.test_id " +
        "LEFT JOIN dbo.doctor d ON d.id = p.doctor_id";

    private static LabResult ReadResult(SqlDataReader reader, List<ResultValue> values) => new(
        reader.GetInt32(0), reader.GetInt32(1), reader.GetString(2), reader.GetDecimal(3), reader.GetString(4),
        Sql.Text(reader, 5), reader.GetInt32(6), reader.GetString(7), Sql.Utc(reader.GetDateTime(8)),
        values, reader.GetString(9), Sql.Utc(reader.GetDateTime(10)), Sql.Utc(reader.GetDateTime(11)),
        reader.IsDBNull(12) ? null : Sql.Utc(reader.GetDateTime(12)));

    public async Task<List<LabResult>> ResultsAsync()
    {
        await using var connection = await database.OpenAsync();
        // One query for every stored value rather than one per result: the list is
        // read as a whole and grouped in memory.
        var values = await ValuesAsync(connection, null);
        await using var command = connection.CreateCommand();
        command.CommandText = $"{ResultSelect} ORDER BY r.id DESC";
        await using var reader = await command.ExecuteReaderAsync();
        var results = new List<LabResult>();
        while (await reader.ReadAsync())
        {
            results.Add(ReadResult(reader, values.Where(value => value.ResultId == reader.GetInt32(0))
                .Select(value => value.Value).ToList()));
        }

        return results;
    }

    public async Task<LabResult?> ResultAsync(int id)
    {
        await using var connection = await database.OpenAsync();
        var values = await ValuesAsync(connection, id);
        await using var command = connection.CreateCommand();
        command.CommandText = $"{ResultSelect} WHERE r.id=@id";
        Sql.Bind(command, "@id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync()
            ? ReadResult(reader, values.Select(value => value.Value).ToList())
            : null;
    }

    public async Task<ResultRow?> RowAsync(int id)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, patient_id, test_id, collected_at, status, created_at, updated_at, " +
            "completed_at FROM dbo.lab_result WHERE id=@id";
        Sql.Bind(command, "@id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync()
            ? new ResultRow(reader.GetInt32(0), reader.GetInt32(1), reader.GetInt32(2), reader.GetDateTime(3),
                reader.GetString(4), reader.GetDateTime(5), reader.GetDateTime(6),
                reader.IsDBNull(7) ? null : reader.GetDateTime(7))
            : null;
    }

    private sealed record StoredValue(int ResultId, ResultValue Value);

    private static async Task<List<StoredValue>> ValuesAsync(SqlConnection connection, int? resultId)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = resultId is null
            ? "SELECT result_id, parameter_id, value, normal_ranges FROM dbo.result_value ORDER BY id"
            : "SELECT result_id, parameter_id, value, normal_ranges FROM dbo.result_value WHERE result_id=@resultId " +
              "ORDER BY id";
        Sql.Bind(command, "@resultId", resultId);
        await using var reader = await command.ExecuteReaderAsync();
        var values = new List<StoredValue>();
        while (await reader.ReadAsync())
        {
            values.Add(new StoredValue(reader.GetInt32(0),
                new ResultValue(reader.GetInt32(1), Sql.Text(reader, 2), Sql.Ranges(reader, 3))));
        }

        return values;
    }

    public async Task<ReportSnapshot?> SnapshotAsync(int resultId)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, result_id, report_title, test_name, test_code, patient_name, age, sex, " +
            "doctor_name, collected_at, completed_at FROM dbo.report_snapshot WHERE result_id=@resultId";
        Sql.Bind(command, "@resultId", resultId);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return null;
        }

        var snapshotId = reader.GetInt32(0);
        var snapshot = new ReportSnapshot(reader.GetInt32(1), Sql.Text(reader, 2) ?? "", reader.GetString(3),
            reader.GetString(4), reader.GetString(5), reader.GetDecimal(6), reader.GetString(7), Sql.Text(reader, 8),
            Sql.Utc(reader.GetDateTime(9)), Sql.Utc(reader.GetDateTime(10)), []);
        await reader.CloseAsync();

        await using var lines = connection.CreateCommand();
        lines.CommandText = "SELECT name, code, unit, value, normal_ranges, option_label, display_order " +
            "FROM dbo.report_line WHERE snapshot_id=@snapshotId ORDER BY display_order, id";
        Sql.Bind(lines, "@snapshotId", snapshotId);
        await using var lineReader = await lines.ExecuteReaderAsync();
        var report = new List<ReportLine>();
        while (await lineReader.ReadAsync())
        {
            report.Add(new ReportLine(lineReader.GetString(0), lineReader.GetString(1), Sql.Text(lineReader, 2),
                Sql.Text(lineReader, 3), Sql.Ranges(lineReader, 4), lineReader.GetInt32(6), Sql.Text(lineReader, 5)));
        }

        return snapshot with { Lines = report };
    }

    /// <summary>
    /// Writes the result, its values and, when it is being completed, the frozen
    /// report, all in one transaction. An update re-checks the row it is replacing
    /// so two people editing the same draft cannot overwrite each other.
    /// </summary>
    public async Task<LabResult> SaveAsync(LabResult result, List<ResultValue> values, ReportSnapshot? snapshot,
        ResultRow? existing, AuditNote note)
    {
        return await database.InTransactionAsync(async (connection, transaction) =>
        {
            var collected = Sql.ParseUtc(result.CollectedAt, "collectedAt");
            var created = Sql.ParseUtc(result.CreatedAt, "createdAt");
            var updated = Sql.ParseUtc(result.UpdatedAt, "updatedAt");
            var completed = Sql.ParseUtcOrNull(result.CompletedAt, "completedAt");
            int resultId;
            if (existing is null)
            {
                await using var insert = connection.CreateCommand();
                insert.Transaction = transaction;
                insert.CommandText = "INSERT INTO dbo.lab_result (patient_id, test_id, collected_at, status, created_at, " +
                    "updated_at, completed_at) OUTPUT INSERTED.id VALUES (@patientId, @testId, @collected, @status, " +
                    "@created, @updated, @completed)";
                Sql.Bind(insert, "@patientId", result.PatientId);
                Sql.Bind(insert, "@testId", result.TestId);
                Sql.Bind(insert, "@collected", collected);
                Sql.Bind(insert, "@status", result.Status);
                Sql.Bind(insert, "@created", created);
                Sql.Bind(insert, "@updated", updated);
                Sql.Bind(insert, "@completed", completed);
                resultId = Convert.ToInt32(await insert.ExecuteScalarAsync());
            }
            else
            {
                resultId = existing.Id;
                await using var update = connection.CreateCommand();
                update.Transaction = transaction;
                update.CommandText = "UPDATE dbo.lab_result SET patient_id=@patientId, test_id=@testId, " +
                    "collected_at=@collected, status=@status, created_at=@created, updated_at=@updated, " +
                    "completed_at=@completed WHERE id=@id AND updated_at=@expected";
                Sql.Bind(update, "@patientId", result.PatientId);
                Sql.Bind(update, "@testId", result.TestId);
                Sql.Bind(update, "@collected", collected);
                Sql.Bind(update, "@status", result.Status);
                Sql.Bind(update, "@created", created);
                Sql.Bind(update, "@updated", updated);
                Sql.Bind(update, "@completed", completed);
                Sql.Bind(update, "@id", resultId);
                Sql.Bind(update, "@expected", existing.UpdatedAt);
                if (await update.ExecuteNonQueryAsync() != 1)
                {
                    throw new ArgumentException("Result changed concurrently; reload it before editing.");
                }

                await using var clear = connection.CreateCommand();
                clear.Transaction = transaction;
                clear.CommandText = "DELETE FROM dbo.result_value WHERE result_id=@id";
                Sql.Bind(clear, "@id", resultId);
                await clear.ExecuteNonQueryAsync();
            }

            foreach (var value in values)
            {
                await using var insert = connection.CreateCommand();
                insert.Transaction = transaction;
                insert.CommandText = "INSERT INTO dbo.result_value (result_id, parameter_id, value, normal_ranges) " +
                    "VALUES (@resultId, @parameterId, @value, @normalRanges)";
                Sql.Bind(insert, "@resultId", resultId);
                Sql.Bind(insert, "@parameterId", value.ParameterId);
                Sql.Bind(insert, "@value", value.Value);
                Sql.Bind(insert, "@normalRanges", Sql.Json(value.NormalRanges));
                await insert.ExecuteNonQueryAsync();
            }

            if (snapshot is not null)
            {
                await using var insertSnapshot = connection.CreateCommand();
                insertSnapshot.Transaction = transaction;
                insertSnapshot.CommandText = "INSERT INTO dbo.report_snapshot (result_id, report_title, test_name, " +
                    "test_code, patient_name, age, sex, doctor_name, collected_at, completed_at) OUTPUT INSERTED.id " +
                    "VALUES (@resultId, @reportTitle, @testName, @testCode, @patientName, @age, @sex, @doctorName, " +
                    "@collected, @completed)";
                Sql.Bind(insertSnapshot, "@resultId", resultId);
                Sql.Bind(insertSnapshot, "@reportTitle", snapshot.ReportTitle);
                Sql.Bind(insertSnapshot, "@testName", snapshot.TestName);
                Sql.Bind(insertSnapshot, "@testCode", snapshot.TestCode);
                Sql.Bind(insertSnapshot, "@patientName", snapshot.PatientName);
                Sql.Bind(insertSnapshot, "@age", snapshot.Age);
                Sql.Bind(insertSnapshot, "@sex", snapshot.Sex);
                Sql.Bind(insertSnapshot, "@doctorName", snapshot.DoctorName);
                Sql.Bind(insertSnapshot, "@collected", Sql.ParseUtc(snapshot.CollectedAt, "collectedAt"));
                Sql.Bind(insertSnapshot, "@completed", Sql.ParseUtc(snapshot.CompletedAt, "completedAt"));
                var snapshotId = Convert.ToInt32(await insertSnapshot.ExecuteScalarAsync());

                foreach (var line in snapshot.Lines)
                {
                    await using var insertLine = connection.CreateCommand();
                    insertLine.Transaction = transaction;
                    insertLine.CommandText = "INSERT INTO dbo.report_line (snapshot_id, name, code, unit, value, " +
                        "normal_ranges, option_label, display_order) VALUES (@snapshotId, @name, @code, @unit, " +
                        "@value, @normalRanges, @optionLabel, @displayOrder)";
                    Sql.Bind(insertLine, "@snapshotId", snapshotId);
                    Sql.Bind(insertLine, "@name", line.Name);
                    Sql.Bind(insertLine, "@code", line.Code);
                    Sql.Bind(insertLine, "@unit", line.Unit);
                    Sql.Bind(insertLine, "@value", line.Value);
                    Sql.Bind(insertLine, "@normalRanges", Sql.Json(line.NormalRanges));
                    Sql.Bind(insertLine, "@optionLabel", line.OptionLabel);
                    Sql.Bind(insertLine, "@displayOrder", line.DisplayOrder);
                    await insertLine.ExecuteNonQueryAsync();
                }
            }

            await audit.WriteAsync(connection, transaction, "Result", resultId, note.Action,
                AuditRepository.LocalActor, note.Details);
            return result with { Id = resultId };
        });
    }
}
