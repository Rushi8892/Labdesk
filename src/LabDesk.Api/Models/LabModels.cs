using System.Text.Json.Serialization;

namespace LabDesk.Api;

public record Master(int? Id, string Code, string Name, bool Active);
public record MasterInput(int? Id, string Kind, string Code, string Name, bool Active);
public record Test(int? Id, string Code, string Name, string? ShortName, int CategoryId, int SpecimenTypeId,
    int? MethodId, string? Description, string? PatientPreparation, string? CollectionInstructions,
    string? Container, string? MinimumSample, string? TurnaroundTime, decimal Price, int DisplayOrder,
    bool Active, string? ReportTitle, string? Notes);
public record TestParameter(int? Id, int TestId, string Code, string Name, string DataType, string? Unit,
    string? ResultFormat, int? DecimalPlaces, bool Required, bool AllowNegative, decimal? TechnicalMin,
    decimal? TechnicalMax, string ReferenceType, string? DisplayReferenceText, int DisplayOrder, bool Active, string? Notes);
public record ParameterOption(int? Id, int ParameterId, string Code, string Label, int SortOrder, bool Abnormal, bool Active);
public record ReferenceInterval(int? Id, int ParameterId, int? Version, string Context, decimal? AgeFrom, decimal? AgeTo,
    string Sex, decimal? LowerValue, decimal? UpperValue, string LowerOperator, string UpperOperator,
    string? ReferenceText, string? DecisionType, decimal? CriticalLow, decimal? CriticalHigh, string? Unit,
    string? EffectiveFrom, string? EffectiveTo, string? Source, string? ApprovedBy, string? ApprovedAt, bool Active);
public record ApprovalInput(string ApprovedBy);
public record ResultValue(int ParameterId, string? Value, string Disposition, string? SkipApprovedBy,
    string? SkipReason, string? Comment, string? Flag, string? ReferenceText, int? ReferenceId);
public record ResultInput(int? Id, int TestId, string PatientName, string PatientCode, decimal Age, string Sex,
    string? Context, string CollectedAt, string? Comment, List<ResultValue> Values);
public record TransitionInput(string Status, string Actor);
public record ReportLine(int ParameterId, string Name, string Code, string? Unit, string? Value,
    string ReferenceText, string Flag, string? Comment, string Disposition, int DisplayOrder,
    ReferenceInterval? Reference, ParameterOption? Option, string? SkipApprovedBy, string? SkipReason);
public record ReportSnapshot(int ResultId, string ReportTitle, string TestName, string TestCode, string PatientName,
    string PatientCode, decimal Age, string Sex, string CollectedAt, string ReleasedAt, string VerifiedBy,
    string ReleasedBy, string? Comment, string? Notes, List<ReportLine> Lines);
public record LabResult(int Id, int TestId, string PatientName, string PatientCode, decimal Age, string Sex,
    string? Context, string CollectedAt, string? Comment, List<ResultValue> Values, string TestName,
    string Status, string CreatedAt, string UpdatedAt, string? VerifiedBy, string? ReleasedBy, string? ReleasedAt,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ResultConfiguration? Configuration = null);
public record ResultConfiguration(Test Test, List<TestParameter> Parameters, List<ParameterOption> Options,
    List<ReferenceInterval> References);
public record AuditEvent(int Id, string Entity, int EntityId, string Action, string Actor, string Timestamp, string Details);
public record Catalog(List<Test> Tests, List<TestParameter> Parameters, List<ParameterOption> Options,
    List<ReferenceInterval> References, List<Master> Categories, List<Master> Specimens, List<Master> Methods);
