using LabDesk.Api;
using System.Diagnostics;

// Use the output directory so configuration works from dotnet run, a published
// folder, or the Replit wrapper regardless of the current working directory.
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args.Where(argument => argument != "--initialize").ToArray(),
    ContentRootPath = AppContext.BaseDirectory
});
builder.Configuration
    .AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false)
    .AddEnvironmentVariables();

var repository = new Repository(builder.Configuration);
if (args.Contains("--initialize"))
{
    if (repository.Provider == "SqlServer")
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

        await repository.InitializeAsync(schema);
        await repository.InitializeAsync(seed);
    }
    else
    {
        await repository.InitializePostgreSqlAsync();
        await SeedCatalog.Seed(repository);
    }

    Console.WriteLine($"Initialized {repository.Provider} schema and starter catalog.");
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
builder.Services.AddSingleton(repository);
builder.Services.AddSingleton<LabDeskService>();
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
            InvalidOperationException => StatusCodes.Status500InternalServerError,
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
app.UseStaticFiles();

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
