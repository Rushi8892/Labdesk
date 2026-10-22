using Microsoft.Data.SqlClient;

namespace LabDesk.Api;

/// <summary>
/// The catalog: categories, specimens and methods, the tests, and each test's
/// parameters with their normal range and dropdown options.
/// </summary>
public sealed class CatalogRepository(Database database, AuditRepository audit)
{
    /// <summary>Maps the interface's kind name onto a real table; nothing else is addressable.</summary>
    public static string MasterTable(string kind) => kind switch
    {
        "Category" => "category",
        "Specimen" => "specimen",
        "Method" => "method",
        _ => throw new ArgumentException("kind must be Category, Specimen, or Method.")
    };

    // ------------------------------------------------------------------ masters

    public async Task<List<Master>> MastersAsync(string kind)
    {
        var table = MasterTable(kind);
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"SELECT id, code, name, active FROM dbo.{table} ORDER BY id";
        await using var reader = await command.ExecuteReaderAsync();
        var masters = new List<Master>();
        while (await reader.ReadAsync())
        {
            masters.Add(new Master(reader.GetInt32(0), reader.GetString(1), reader.GetString(2), Sql.Flag(reader, 3)));
        }

        return masters;
    }

    public async Task<Master?> MasterAsync(string kind, int id)
    {
        var table = MasterTable(kind);
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"SELECT id, code, name, active FROM dbo.{table} WHERE id=@id";
        Sql.Bind(command, "@id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync()
            ? new Master(reader.GetInt32(0), reader.GetString(1), reader.GetString(2), Sql.Flag(reader, 3))
            : null;
    }

    public async Task<Master> SaveMasterAsync(string kind, Master master, AuditNote note)
    {
        var table = MasterTable(kind);
        try
        {
            return await database.InTransactionAsync(async (connection, transaction) =>
            {
                int id;
                if (master.Id is null)
                {
                    await using var insert = connection.CreateCommand();
                    insert.Transaction = transaction;
                    insert.CommandText =
                        $"INSERT INTO dbo.{table} (code, name, active) OUTPUT INSERTED.id VALUES (@code, @name, @active)";
                    Sql.Bind(insert, "@code", master.Code);
                    Sql.Bind(insert, "@name", master.Name);
                    Sql.Bind(insert, "@active", master.Active);
                    id = Convert.ToInt32(await insert.ExecuteScalarAsync());
                }
                else
                {
                    id = master.Id.Value;
                    await using var update = connection.CreateCommand();
                    update.Transaction = transaction;
                    update.CommandText =
                        $"UPDATE dbo.{table} SET code=@code, name=@name, active=@active WHERE id=@id";
                    Sql.Bind(update, "@code", master.Code);
                    Sql.Bind(update, "@name", master.Name);
                    Sql.Bind(update, "@active", master.Active);
                    Sql.Bind(update, "@id", id);
                    if (await update.ExecuteNonQueryAsync() != 1)
                    {
                        throw new KeyNotFoundException($"{kind} {id} was not found.");
                    }
                }

                await audit.WriteAsync(connection, transaction, kind, id, note.Action, AuditRepository.LocalActor,
                    note.Details);
                return master with { Id = id };
            });
        }
        catch (SqlException exception) when (Sql.IsDuplicateKey(exception))
        {
            throw new ArgumentException($"A {kind.ToLowerInvariant()} with code '{master.Code}' already exists.");
        }
    }

    // -------------------------------------------------------------------- tests

    private const string TestSelect = "SELECT id, code, name, short_name, category_id, specimen_id, method_id, " +
        "description, patient_preparation, collection_instructions, container, minimum_sample, turnaround_time, " +
        "display_order, active, report_title, notes FROM dbo.test";

    // category_id and specimen_id are nullable in the database but every test made
    // through the interface has both, and the interface expects a number here.
    private static Test ReadTest(SqlDataReader reader) => new(
        reader.GetInt32(0), reader.GetString(1), reader.GetString(2), Sql.Text(reader, 3), Sql.Int(reader, 4) ?? 0,
        Sql.Int(reader, 5) ?? 0, Sql.Int(reader, 6), Sql.Text(reader, 7), Sql.Text(reader, 8), Sql.Text(reader, 9),
        Sql.Text(reader, 10), Sql.Text(reader, 11), Sql.Text(reader, 12), reader.GetInt32(13), Sql.Flag(reader, 14),
        Sql.Text(reader, 15), Sql.Text(reader, 16));

    public async Task<List<Test>> TestsAsync()
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"{TestSelect} ORDER BY display_order, id";
        await using var reader = await command.ExecuteReaderAsync();
        var tests = new List<Test>();
        while (await reader.ReadAsync())
        {
            tests.Add(ReadTest(reader));
        }

        return tests;
    }

    public async Task<Test?> TestAsync(int id)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"{TestSelect} WHERE id=@id";
        Sql.Bind(command, "@id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadTest(reader) : null;
    }

    private static void BindTest(SqlCommand command, Test test)
    {
        Sql.Bind(command, "@code", test.Code);
        Sql.Bind(command, "@name", test.Name);
        Sql.Bind(command, "@shortName", test.ShortName);
        Sql.Bind(command, "@categoryId", test.CategoryId);
        Sql.Bind(command, "@specimenId", test.SpecimenTypeId);
        Sql.Bind(command, "@methodId", test.MethodId);
        Sql.Bind(command, "@description", test.Description);
        Sql.Bind(command, "@patientPreparation", test.PatientPreparation);
        Sql.Bind(command, "@collectionInstructions", test.CollectionInstructions);
        Sql.Bind(command, "@container", test.Container);
        Sql.Bind(command, "@minimumSample", test.MinimumSample);
        Sql.Bind(command, "@turnaroundTime", test.TurnaroundTime);
        Sql.Bind(command, "@displayOrder", test.DisplayOrder);
        Sql.Bind(command, "@active", test.Active);
        Sql.Bind(command, "@reportTitle", test.ReportTitle);
        Sql.Bind(command, "@notes", test.Notes);
    }

    public async Task<Test> SaveTestAsync(Test test, AuditNote note)
    {
        try
        {
            return await database.InTransactionAsync(async (connection, transaction) =>
            {
                int id;
                if (test.Id is null)
                {
                    await using var insert = connection.CreateCommand();
                    insert.Transaction = transaction;
                    insert.CommandText = "INSERT INTO dbo.test (code, name, short_name, category_id, specimen_id, " +
                        "method_id, description, patient_preparation, collection_instructions, container, " +
                        "minimum_sample, turnaround_time, display_order, active, report_title, notes) " +
                        "OUTPUT INSERTED.id VALUES (@code, @name, @shortName, @categoryId, @specimenId, @methodId, " +
                        "@description, @patientPreparation, @collectionInstructions, @container, @minimumSample, " +
                        "@turnaroundTime, @displayOrder, @active, @reportTitle, @notes)";
                    BindTest(insert, test);
                    id = Convert.ToInt32(await insert.ExecuteScalarAsync());
                }
                else
                {
                    id = test.Id.Value;
                    await using var update = connection.CreateCommand();
                    update.Transaction = transaction;
                    update.CommandText = "UPDATE dbo.test SET code=@code, name=@name, short_name=@shortName, " +
                        "category_id=@categoryId, specimen_id=@specimenId, method_id=@methodId, description=@description, " +
                        "patient_preparation=@patientPreparation, collection_instructions=@collectionInstructions, " +
                        "container=@container, minimum_sample=@minimumSample, turnaround_time=@turnaroundTime, " +
                        "display_order=@displayOrder, active=@active, report_title=@reportTitle, notes=@notes WHERE id=@id";
                    BindTest(update, test);
                    Sql.Bind(update, "@id", id);
                    if (await update.ExecuteNonQueryAsync() != 1)
                    {
                        throw new KeyNotFoundException($"Test {id} was not found.");
                    }
                }

                await audit.WriteAsync(connection, transaction, "Test", id, note.Action, AuditRepository.LocalActor,
                    note.Details);
                return test with { Id = id };
            });
        }
        catch (SqlException exception) when (Sql.IsDuplicateKey(exception))
        {
            throw new ArgumentException($"A test with code '{test.Code}' already exists.");
        }
    }

    // --------------------------------------------------------------- parameters

    private const string ParameterSelect = "SELECT id, test_id, code, name, data_type, unit, result_format, " +
        "decimal_places, required, allow_negative, technical_min, technical_max, normal_ranges, " +
        "display_order, active, notes FROM dbo.test_parameter";

    private static TestParameter ReadParameter(SqlDataReader reader) => new(
        reader.GetInt32(0), reader.GetInt32(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
        Sql.Text(reader, 5), Sql.Text(reader, 6), Sql.Int(reader, 7), Sql.Flag(reader, 8), Sql.Flag(reader, 9),
        Sql.Decimal(reader, 10), Sql.Decimal(reader, 11), Sql.Ranges(reader, 12),
        reader.GetInt32(13), Sql.Flag(reader, 14), Sql.Text(reader, 15));

    public async Task<List<TestParameter>> ParametersAsync(int? testId = null)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = testId is null
            ? $"{ParameterSelect} ORDER BY display_order, id"
            : $"{ParameterSelect} WHERE test_id=@testId ORDER BY display_order, id";
        Sql.Bind(command, "@testId", testId);
        await using var reader = await command.ExecuteReaderAsync();
        var parameters = new List<TestParameter>();
        while (await reader.ReadAsync())
        {
            parameters.Add(ReadParameter(reader));
        }

        return parameters;
    }

    public async Task<TestParameter?> ParameterAsync(int id)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"{ParameterSelect} WHERE id=@id";
        Sql.Bind(command, "@id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadParameter(reader) : null;
    }

    private static void BindParameter(SqlCommand command, TestParameter parameter)
    {
        Sql.Bind(command, "@testId", parameter.TestId);
        Sql.Bind(command, "@code", parameter.Code);
        Sql.Bind(command, "@name", parameter.Name);
        Sql.Bind(command, "@dataType", parameter.DataType);
        Sql.Bind(command, "@unit", parameter.Unit);
        Sql.Bind(command, "@resultFormat", parameter.ResultFormat);
        Sql.Bind(command, "@decimalPlaces", parameter.DecimalPlaces);
        Sql.Bind(command, "@required", parameter.Required);
        Sql.Bind(command, "@allowNegative", parameter.AllowNegative);
        Sql.Bind(command, "@technicalMin", parameter.TechnicalMin);
        Sql.Bind(command, "@technicalMax", parameter.TechnicalMax);
        Sql.Bind(command, "@normalRanges", Sql.Json(parameter.NormalRanges));
        Sql.Bind(command, "@displayOrder", parameter.DisplayOrder);
        Sql.Bind(command, "@active", parameter.Active);
        Sql.Bind(command, "@notes", parameter.Notes);
    }

    public async Task<TestParameter> SaveParameterAsync(TestParameter parameter, AuditNote note)
    {
        try
        {
            return await database.InTransactionAsync(async (connection, transaction) =>
            {
                int id;
                if (parameter.Id is null)
                {
                    await using var insert = connection.CreateCommand();
                    insert.Transaction = transaction;
                    insert.CommandText = "INSERT INTO dbo.test_parameter (test_id, code, name, data_type, unit, " +
                        "result_format, decimal_places, required, allow_negative, technical_min, technical_max, " +
                        "normal_ranges, display_order, active, notes) " +
                        "OUTPUT INSERTED.id VALUES (@testId, @code, @name, @dataType, @unit, @resultFormat, " +
                        "@decimalPlaces, @required, @allowNegative, @technicalMin, @technicalMax, @normalRanges, " +
                        "@displayOrder, @active, @notes)";
                    BindParameter(insert, parameter);
                    id = Convert.ToInt32(await insert.ExecuteScalarAsync());
                }
                else
                {
                    id = parameter.Id.Value;
                    await using var update = connection.CreateCommand();
                    update.Transaction = transaction;
                    update.CommandText = "UPDATE dbo.test_parameter SET code=@code, name=@name, data_type=@dataType, " +
                        "unit=@unit, result_format=@resultFormat, decimal_places=@decimalPlaces, required=@required, " +
                        "allow_negative=@allowNegative, technical_min=@technicalMin, technical_max=@technicalMax, " +
                        "normal_ranges=@normalRanges, " +
                        "display_order=@displayOrder, active=@active, notes=@notes WHERE id=@id";
                    BindParameter(update, parameter);
                    Sql.Bind(update, "@id", id);
                    if (await update.ExecuteNonQueryAsync() != 1)
                    {
                        throw new KeyNotFoundException($"Parameter {id} was not found.");
                    }
                }

                await audit.WriteAsync(connection, transaction, "Parameter", id, note.Action,
                    AuditRepository.LocalActor, note.Details);
                return parameter with { Id = id };
            });
        }
        catch (SqlException exception) when (Sql.IsDuplicateKey(exception))
        {
            throw new ArgumentException($"A parameter with code '{parameter.Code}' already exists within this test.");
        }
    }

    // ------------------------------------------------------------------ options

    public async Task<List<ParameterOption>> OptionsAsync(int? parameterId = null)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = parameterId is null
            ? "SELECT id, parameter_id, code, label, sort_order, active FROM dbo.parameter_option " +
              "ORDER BY sort_order, id"
            : "SELECT id, parameter_id, code, label, sort_order, active FROM dbo.parameter_option " +
              "WHERE parameter_id=@parameterId ORDER BY sort_order, id";
        Sql.Bind(command, "@parameterId", parameterId);
        await using var reader = await command.ExecuteReaderAsync();
        var options = new List<ParameterOption>();
        while (await reader.ReadAsync())
        {
            options.Add(new ParameterOption(reader.GetInt32(0), reader.GetInt32(1), reader.GetString(2),
                reader.GetString(3), reader.GetInt32(4), Sql.Flag(reader, 5)));
        }

        return options;
    }

    public async Task<ParameterOption?> OptionAsync(int id)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, parameter_id, code, label, sort_order, active FROM " +
            "dbo.parameter_option WHERE id=@id";
        Sql.Bind(command, "@id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync()
            ? new ParameterOption(reader.GetInt32(0), reader.GetInt32(1), reader.GetString(2), reader.GetString(3),
                reader.GetInt32(4), Sql.Flag(reader, 5))
            : null;
    }

    private static void BindOption(SqlCommand command, ParameterOption option)
    {
        Sql.Bind(command, "@parameterId", option.ParameterId);
        Sql.Bind(command, "@code", option.Code);
        Sql.Bind(command, "@label", option.Label);
        Sql.Bind(command, "@sortOrder", option.SortOrder);
        Sql.Bind(command, "@active", option.Active);
    }

    public async Task<ParameterOption> SaveOptionAsync(ParameterOption option, AuditNote note)
    {
        try
        {
            return await database.InTransactionAsync(async (connection, transaction) =>
            {
                int id;
                if (option.Id is null)
                {
                    await using var insert = connection.CreateCommand();
                    insert.Transaction = transaction;
                    insert.CommandText = "INSERT INTO dbo.parameter_option (parameter_id, code, label, sort_order, " +
                        "active) OUTPUT INSERTED.id VALUES (@parameterId, @code, @label, @sortOrder, @active)";
                    BindOption(insert, option);
                    id = Convert.ToInt32(await insert.ExecuteScalarAsync());
                }
                else
                {
                    id = option.Id.Value;
                    await using var update = connection.CreateCommand();
                    update.Transaction = transaction;
                    update.CommandText = "UPDATE dbo.parameter_option SET code=@code, label=@label, " +
                        "sort_order=@sortOrder, active=@active WHERE id=@id";
                    BindOption(update, option);
                    Sql.Bind(update, "@id", id);
                    if (await update.ExecuteNonQueryAsync() != 1)
                    {
                        throw new KeyNotFoundException($"Option {id} was not found.");
                    }
                }

                await audit.WriteAsync(connection, transaction, "Option", id, note.Action,
                    AuditRepository.LocalActor, note.Details);
                return option with { Id = id };
            });
        }
        catch (SqlException exception) when (Sql.IsDuplicateKey(exception))
        {
            throw new ArgumentException($"An option with code '{option.Code}' already exists for this parameter.");
        }
    }
}
