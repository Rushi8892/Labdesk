namespace LabDesk.Api;

/// <summary>
/// Rules for the referring doctors and the patients whose samples are run.
/// A patient is recorded before any result exists; results then point at them.
/// </summary>
public sealed class PatientService(PatientRepository patients)
{
    public Task<List<Doctor>> DoctorsAsync() => patients.DoctorsAsync();

    public async Task<Doctor> SaveDoctorAsync(DoctorInput input)
    {
        var name = Validate.Required(input.Name, "name");
        Validate.Max(name, 200, "name");
        var before = input.Id is null ? null : await patients.DoctorAsync(input.Id.Value);
        var doctor = new Doctor(input.Id, name, input.Active);
        return await patients.SaveDoctorAsync(doctor, AuditRepository.Note(
            input.Id is null ? "created" : "updated", new { before, after = doctor }));
    }

    public Task<List<Patient>> PatientsAsync() => patients.PatientsAsync();

    public async Task<Patient> SavePatientAsync(PatientInput input)
    {
        var name = Validate.Required(input.Name, "name");
        Validate.Max(name, 200, "name");
        Validate.Require(input.Age >= 0 && input.Age <= 999.99m, "age must be from 0 through 999.99 years.");
        Validate.Sex(input.Sex);
        var phone = Validate.Optional(input.Phone, 30, "phone");
        if (input.DoctorId is int doctorId)
        {
            Validate.Known(await patients.DoctorAsync(doctorId) is not null, "Doctor", doctorId);
        }

        var before = input.Id is null ? null : await patients.PatientAsync(input.Id.Value);
        var patient = new Patient(input.Id, name, input.Age, input.Sex, phone, input.DoctorId, null, input.Active);
        var saved = await patients.SavePatientAsync(patient, AuditRepository.Note(
            input.Id is null ? "created" : "updated", new { before, after = patient }));

        // Read back so the caller gets the referring doctor's name with the row.
        return await patients.PatientAsync(saved.Id!.Value) ?? saved;
    }
}
