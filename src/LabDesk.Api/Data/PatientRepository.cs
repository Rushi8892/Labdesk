using Microsoft.Data.SqlClient;

namespace LabDesk.Api;

/// <summary>Referring doctors, and the patients whose samples the laboratory runs.</summary>
public sealed class PatientRepository(Database database, AuditRepository audit)
{
    // ------------------------------------------------------------------ doctors

    public async Task<List<Doctor>> DoctorsAsync()
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, name, active FROM dbo.doctor ORDER BY name, id";
        await using var reader = await command.ExecuteReaderAsync();
        var doctors = new List<Doctor>();
        while (await reader.ReadAsync())
        {
            doctors.Add(new Doctor(reader.GetInt32(0), reader.GetString(1), Sql.Flag(reader, 2)));
        }

        return doctors;
    }

    public async Task<Doctor?> DoctorAsync(int id)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id, name, active FROM dbo.doctor WHERE id=@id";
        Sql.Bind(command, "@id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync()
            ? new Doctor(reader.GetInt32(0), reader.GetString(1), Sql.Flag(reader, 2))
            : null;
    }

    public async Task<Doctor> SaveDoctorAsync(Doctor doctor, AuditNote note) => await database
        .InTransactionAsync(async (connection, transaction) =>
        {
            int id;
            if (doctor.Id is null)
            {
                await using var insert = connection.CreateCommand();
                insert.Transaction = transaction;
                insert.CommandText = "INSERT INTO dbo.doctor (name, active) OUTPUT INSERTED.id VALUES (@name, @active)";
                Sql.Bind(insert, "@name", doctor.Name);
                Sql.Bind(insert, "@active", doctor.Active);
                id = Convert.ToInt32(await insert.ExecuteScalarAsync());
            }
            else
            {
                id = doctor.Id.Value;
                await using var update = connection.CreateCommand();
                update.Transaction = transaction;
                update.CommandText = "UPDATE dbo.doctor SET name=@name, active=@active WHERE id=@id";
                Sql.Bind(update, "@name", doctor.Name);
                Sql.Bind(update, "@active", doctor.Active);
                Sql.Bind(update, "@id", id);
                if (await update.ExecuteNonQueryAsync() != 1)
                {
                    throw new KeyNotFoundException($"Doctor {id} was not found.");
                }
            }

            await audit.WriteAsync(connection, transaction, "Doctor", id, note.Action, AuditRepository.LocalActor,
                note.Details);
            return doctor with { Id = id };
        });

    // ----------------------------------------------------------------- patients

    private const string PatientSelect = "SELECT p.id, p.name, p.age, p.sex, p.phone, p.doctor_id, d.name, p.active " +
        "FROM dbo.patient p LEFT JOIN dbo.doctor d ON d.id = p.doctor_id";

    private static Patient ReadPatient(SqlDataReader reader) => new(
        reader.GetInt32(0), reader.GetString(1), reader.GetDecimal(2), reader.GetString(3), Sql.Text(reader, 4),
        Sql.Int(reader, 5), Sql.Text(reader, 6), Sql.Flag(reader, 7));

    public async Task<List<Patient>> PatientsAsync()
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"{PatientSelect} ORDER BY p.name, p.id";
        await using var reader = await command.ExecuteReaderAsync();
        var patients = new List<Patient>();
        while (await reader.ReadAsync())
        {
            patients.Add(ReadPatient(reader));
        }

        return patients;
    }

    public async Task<Patient?> PatientAsync(int id)
    {
        await using var connection = await database.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"{PatientSelect} WHERE p.id=@id";
        Sql.Bind(command, "@id", id);
        await using var reader = await command.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadPatient(reader) : null;
    }

    public async Task<Patient> SavePatientAsync(Patient patient, AuditNote note)
    {
        try
        {
            return await database.InTransactionAsync(async (connection, transaction) =>
            {
                int id;
                if (patient.Id is null)
                {
                    await using var insert = connection.CreateCommand();
                    insert.Transaction = transaction;
                    insert.CommandText = "INSERT INTO dbo.patient (name, age, sex, phone, doctor_id, active) " +
                        "OUTPUT INSERTED.id VALUES (@name, @age, @sex, @phone, @doctorId, @active)";
                    Sql.Bind(insert, "@name", patient.Name);
                    Sql.Bind(insert, "@age", patient.Age);
                    Sql.Bind(insert, "@sex", patient.Sex);
                    Sql.Bind(insert, "@phone", patient.Phone);
                    Sql.Bind(insert, "@doctorId", patient.DoctorId);
                    Sql.Bind(insert, "@active", patient.Active);
                    id = Convert.ToInt32(await insert.ExecuteScalarAsync());
                }
                else
                {
                    id = patient.Id.Value;
                    await using var update = connection.CreateCommand();
                    update.Transaction = transaction;
                    update.CommandText = "UPDATE dbo.patient SET name=@name, age=@age, sex=@sex, phone=@phone, " +
                        "doctor_id=@doctorId, active=@active WHERE id=@id";
                    Sql.Bind(update, "@name", patient.Name);
                    Sql.Bind(update, "@age", patient.Age);
                    Sql.Bind(update, "@sex", patient.Sex);
                    Sql.Bind(update, "@phone", patient.Phone);
                    Sql.Bind(update, "@doctorId", patient.DoctorId);
                    Sql.Bind(update, "@active", patient.Active);
                    Sql.Bind(update, "@id", id);
                    if (await update.ExecuteNonQueryAsync() != 1)
                    {
                        throw new KeyNotFoundException($"Patient {id} was not found.");
                    }
                }

                await audit.WriteAsync(connection, transaction, "Patient", id, note.Action,
                    AuditRepository.LocalActor, note.Details);
                return patient with { Id = id };
            });
        }
        catch (SqlException exception) when (exception.Number is 547)
        {
            throw new ArgumentException($"Doctor {patient.DoctorId} was not found.");
        }
    }
}
