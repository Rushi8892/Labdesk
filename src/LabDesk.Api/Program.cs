using LabDesk.Api;

var repository = new Repository();
if (args.Contains("--initialize"))
{
    var directory = new DirectoryInfo(Directory.GetCurrentDirectory());
    while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "database", "postgresql.sql")))
    {
        directory = directory.Parent;
    }

    if (directory is null)
    {
        throw new FileNotFoundException("Could not locate database schema scripts.");
    }

    var schema = Path.Combine(directory.FullName, "database",
        repository.Provider == "SqlServer" ? "sqlserver.sql" : "postgresql.sql");
    await Repository.InitializeAsync(repository.Provider, schema);
    await SeedCatalog.Seed(repository);
    Console.WriteLine($"Initialized {repository.Provider} development catalog.");
    return;
}

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls($"http://0.0.0.0:{Environment.GetEnvironmentVariable("PORT") ?? "5000"}");
builder.Services.AddSingleton(repository);
builder.Services.AddSingleton<LabDeskService>();
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
});
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors();
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception exception)
    {
        var status = exception switch
        {
            KeyNotFoundException => StatusCodes.Status404NotFound,
            ArgumentException => StatusCodes.Status400BadRequest,
            BadHttpRequestException => StatusCodes.Status400BadRequest,
            InvalidOperationException => StatusCodes.Status500InternalServerError,
            _ => StatusCodes.Status500InternalServerError
        };

        if (context.Response.HasStarted)
        {
            throw;
        }

        context.Response.Clear();
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json";
        var message = status == StatusCodes.Status500InternalServerError &&
            exception is not InvalidOperationException
            ? "An unexpected server error occurred."
            : exception.Message;
        await context.Response.WriteAsJsonAsync(new { error = message });
    }
});

var api = app.MapGroup("/api");
api.MapGet("/healthz", () => Results.Ok(new { status = "ok" }));
api.MapGet("/catalog", (LabDeskService service) => service.Catalog());
api.MapPost("/tests", (Test input, LabDeskService service) => service.SaveTest(input));
api.MapPost("/parameters", (TestParameter input, LabDeskService service) => service.SaveParameter(input));
api.MapPost("/options", (ParameterOption input, LabDeskService service) => service.SaveOption(input));
api.MapPost("/references", (ReferenceInterval input, LabDeskService service) => service.SaveReference(input));
api.MapPost("/references/{id:int}/approve", (int id, ApprovalInput input, LabDeskService service) =>
    service.ApproveReference(id, input));
api.MapPost("/masters", (MasterInput input, LabDeskService service) => service.SaveMaster(input));
api.MapGet("/results", (LabDeskService service) => service.Results());
api.MapPost("/results", (ResultInput input, LabDeskService service) => service.SaveResult(input));
api.MapGet("/results/{id:int}/report", (int id, LabDeskService service) => service.Report(id));
api.MapGet("/audit", (LabDeskService service) => service.Audit());

app.Run();
