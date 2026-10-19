using System.Text.Json.Serialization;

namespace LabDesk.Api;

// Wire shapes. Names are what the desktop interface sends and reads, so they are
// deliberately unchanged where the concept survived the move off lab_entity.

public record Master(int? Id, string Code, string Name, bool Active);
public record MasterInput(int? Id, string Kind, string Code, string Name, bool Active);

public record Doctor(int? Id, string Name, bool Active);
public record DoctorInput(int? Id, string Name, bool Active);

// Age is years with fractions allowed, so an infant can be recorded.
public record Patient(int? Id, string Name, decimal Age, string Sex, string? Phone, int? DoctorId,
    string? DoctorName, bool Active);
public record PatientInput(int? Id, string Name, decimal Age, string Sex, string? Phone, int? DoctorId,
    bool Active);

public record Test(int? Id, string Code, string Name, string? ShortName, int CategoryId, int SpecimenTypeId,
    int? MethodId, string? Description, string? PatientPreparation, string? CollectionInstructions,
    string? Container, string? MinimumSample, string? TurnaroundTime, int DisplayOrder,
    bool Active, string? ReportTitle, string? Notes);

// One parameter prints one or more reference lines - "Male: 65-176 ug/dL",
// "Female: 26-170 ug/dL" - and nothing compares a result against them. There is
// no separate interval table, no flag and no price.
public record TestParameter(int? Id, int TestId, string Code, string Name, string DataType, string? Unit,
    string? ResultFormat, int? DecimalPlaces, bool Required, bool AllowNegative, decimal? TechnicalMin,
    decimal? TechnicalMax, string[]? NormalRanges, int DisplayOrder, bool Active, string? Notes);

public record ParameterOption(int? Id, int ParameterId, string Code, string Label, int SortOrder, bool Active);

// NormalRanges travels as the lines the parameter showed when the value was saved.
public record ResultValue(int ParameterId, string? Value, string[]? NormalRanges = null);

// A result belongs to a patient who already exists, and to a test.
public record ResultInput(int? Id, int PatientId, int TestId, string CollectedAt, List<ResultValue>? Values,
    bool Complete = false);

public record ReportLine(string Name, string Code, string? Unit, string? Value, string[] NormalRanges,
    int DisplayOrder, string? OptionLabel);

// Frozen when the result is completed, so a later edit to the patient, the doctor
// or the catalog cannot rewrite a report that has already been printed.
public record ReportSnapshot(int ResultId, string ReportTitle, string TestName, string TestCode, string PatientName,
    decimal Age, string Sex, string? DoctorName, string CollectedAt, string CompletedAt, List<ReportLine> Lines);

public record LabResult(int Id, int PatientId, string PatientName, decimal Age, string Sex, string? DoctorName,
    int TestId, string TestName, string CollectedAt, List<ResultValue> Values, string Status, string CreatedAt,
    string UpdatedAt, string? CompletedAt);

public record AuditEvent(int Id, string Entity, int EntityId, string Action, string Actor, string Timestamp,
    string Details);

public record Catalog(List<Test> Tests, List<TestParameter> Parameters, List<ParameterOption> Options,
    List<Master> Categories, List<Master> Specimens, List<Master> Methods);

// The laboratory's own letterhead, read from configuration rather than stored as
// laboratory data. Logo names a file inside wwwroot.
public record LabSettings(string Name, string Address, string Phone1, string Phone2, string? Logo);

// What a writer hands the audit trail, and what the report page prints.
public record AuditNote(string Action, string Details);
