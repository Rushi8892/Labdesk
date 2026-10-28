using LabDesk.Api;
using System.Diagnostics;

// Use the output directory so configuration works from dotnet run, a published
// folder, or any wrapper regardless of the current working directory.
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args.Where(argument => argument != "--initialize").ToArray(),
    ContentRootPath = AppContext.BaseDirectory
});
builder.Configuration
    .AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false)
    .AddEnvironmentVariables();

var database = new Database(builder.Configuration);
if (args.Contains("--initialize"))
{
    var databaseDirectory = Path.Combine(AppContext.BaseDirectory, "database");
    var directory = new DirectoryInfo(Directory.GetCurrentDirectory());
    while (!Directory.Exists(databaseDirectory) && directory is not null)
    {
        databaseDirectory = Path.Combine(directory.FullName, "database");
        directory = directory.Parent;
    }

    var schema = Path.Combine(databaseDirectory, "schema.sql");
    var seed = Path.Combine(databaseDirectory, "seed.sql");
    if (!File.Exists(schema) || !File.Exists(seed))
    {
        throw new FileNotFoundException(
            "Could not locate database/schema.sql and database/seed.sql. Keep both beside the executable.");
    }

    await database.EnsureDatabaseAsync();
    await database.InitializeAsync(schema);
    await database.InitializeAsync(seed);
    Console.WriteLine("Initialized the GSLabdesk schema and master data.");
    return;
}

var port = builder.Configuration["PORT"];
if (!string.IsNullOrWhiteSpace(port) &&
    (!int.TryParse(port, out var parsedPort) || parsedPort is < 1 or > 65535))
{
    throw new InvalidOperationException("PORT must be an integer from 1 through 65535.");
}

var serverUrl = !string.IsNullOrWhiteSpace(port)
    ? $"http://0.0.0.0:{port}"
    : builder.Configuration["ASPNETCORE_URLS"]
        ?? builder.Configuration["Server:Url"]
        ?? "http://localhost:5000";
builder.WebHost.UseUrls(serverUrl);

builder.Services.AddSingleton(database);
builder.Services.AddSingleton<AuditRepository>();
builder.Services.AddSingleton<CatalogRepository>();
builder.Services.AddSingleton<PatientRepository>();
builder.Services.AddSingleton<ResultRepository>();
builder.Services.AddSingleton<CatalogService>();
builder.Services.AddSingleton<PatientService>();
builder.Services.AddSingleton<ResultService>();

// The laboratory's own letterhead lives in configuration, not in the database:
// it is stationery, not a laboratory record. Lab:Logo names a file in wwwroot.
builder.Services.AddSingleton(new LabSettings(
    builder.Configuration["Lab:Name"] ?? "Laboratory",
    builder.Configuration["Lab:Address"] ?? string.Empty,
    builder.Configuration["Lab:Phone1"] ?? string.Empty,
    builder.Configuration["Lab:Phone2"] ?? string.Empty,
    builder.Configuration["Lab:Logo"] ?? "img/gs-lab-mark.png",
    builder.Configuration["Lab:Tagline"],
    builder.Configuration["Lab:TechnicianLabel"] ?? "Lab Technician Signature",
    builder.Configuration["Lab:SignatoryName"],
    builder.Configuration["Lab:SignatoryQualification"]));

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
});
var app = builder.Build();
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
            _ => StatusCodes.Status500InternalServerError
        };

        if (context.Response.HasStarted)
        {
            throw;
        }

        if (status == StatusCodes.Status500InternalServerError)
        {
            app.Logger.LogError(exception, "Unhandled request error for {Method} {Path}.",
                context.Request.Method, context.Request.Path);
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

// The desktop interface and API share the same origin and port.
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    // Browsers cache scripts without asking, so a rebuilt page can keep running
    // yesterday's module. Revalidate every asset instead: a 304 costs nothing here.
    OnPrepareResponse = context => context.Context.Response.Headers.CacheControl = "no-cache",
});

var api = app.MapGroup("/api");
api.MapGet("/healthz", () => Results.Ok(new { status = "ok" }));
api.MapGet("/lab", (LabSettings lab) => lab);
api.MapGet("/catalog", (CatalogService service) => service.CatalogAsync());
api.MapPost("/tests", (Test input, CatalogService service) => service.SaveTestAsync(input));
api.MapPost("/parameters", (TestParameter input, CatalogService service) => service.SaveParameterAsync(input));
api.MapPost("/options", (ParameterOption input, CatalogService service) => service.SaveOptionAsync(input));
api.MapPost("/masters", (MasterInput input, CatalogService service) => service.SaveMasterAsync(input));
api.MapGet("/doctors", (PatientService service) => service.DoctorsAsync());
api.MapPost("/doctors", (DoctorInput input, PatientService service) => service.SaveDoctorAsync(input));
api.MapGet("/patients", (PatientService service) => service.PatientsAsync());
api.MapPost("/patients", (PatientInput input, PatientService service) => service.SavePatientAsync(input));
api.MapGet("/results", (ResultService service) => service.ResultsAsync());
api.MapPost("/results", (ResultInput input, ResultService service) => service.SaveResultAsync(input));
api.MapGet("/results/{id:int}/report", (int id, ResultService service) => service.ReportAsync(id));
api.MapGet("/audit", (AuditRepository audit) => audit.ListAsync());

app.Map("/api/{**path}", () => Results.NotFound(new { error = "API endpoint not found." }));
app.MapFallbackToFile("index.html");

if (OperatingSystem.IsWindows() && builder.Configuration.GetValue("Browser:OpenOnStart", true))
{
    app.Lifetime.ApplicationStarted.Register(() =>
    {
        try
        {
            var address = new UriBuilder(app.Urls.First());
            if (address.Host is "0.0.0.0" or "::" or "[::]")
            {
                address.Host = "localhost";
            }
            Process.Start(new ProcessStartInfo(address.Uri.AbsoluteUri) { UseShellExecute = true });
        }
        catch (Exception exception)
        {
            app.Logger.LogWarning(exception, "Could not open the browser. Open the configured server URL manually.");
        }
    });
}

app.Run();
