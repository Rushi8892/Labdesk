using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace LabDesk.Desktop;

// Desktop entry point: starts LabDesk.Api.exe beside this exe (hidden), waits for
// its health check, then shows the interface in a normal application window.
internal static class Program
{
    private const string Title = "G.S. LAB";
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private static Process? server;

    [STAThread]
    private static void Main()
    {
        // One window per session; a second double-click brings the open window forward.
        using var single = new Mutex(true, @"Local\GSLabDesk", out var first);
        if (!first)
        {
            FocusExisting();
            return;
        }

        ApplicationConfiguration.Initialize();

        var folder = AppContext.BaseDirectory;
        var url = ReadServerUrl(folder);

        if (!IsUp(url).GetAwaiter().GetResult())
        {
            var exe = Path.Combine(folder, "LabDesk.Api.exe");
            if (!File.Exists(exe))
            {
                MessageBox.Show($"LabDesk.Api.exe was not found in\n{folder}", Title,
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            server = Process.Start(new ProcessStartInfo(exe, "--no-browser")
            {
                WorkingDirectory = folder,
                UseShellExecute = false,
                CreateNoWindow = true,
            });
            if (server is null || !WaitForServer(url, TimeSpan.FromSeconds(40)))
            {
                MessageBox.Show("The application did not start.\n\n" +
                    "Run LabDesk.Api.exe from this folder once to see the error.",
                    Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
                StopServer();
                return;
            }
        }

        Application.Run(new MainForm(url, server is not null));
    }

    private static async Task<bool> IsUp(string url)
    {
        try
        {
            using var response = await Http.GetAsync(url.TrimEnd('/') + "/api/healthz");
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private static bool WaitForServer(string url, TimeSpan timeout)
    {
        var until = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < until)
        {
            if (IsUp(url).GetAwaiter().GetResult()) return true;
            Thread.Sleep(500);
        }
        return false;
    }

    // The server URL follows the same precedence as LabDesk.Api's startup.
    private static string ReadServerUrl(string folder)
    {
        var url = Environment.GetEnvironmentVariable("ASPNETCORE_URLS");
        var port = Environment.GetEnvironmentVariable("PORT");
        if (!string.IsNullOrWhiteSpace(port)) url = $"http://localhost:{port}";
        if (string.IsNullOrWhiteSpace(url))
        {
            try
            {
                using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(folder, "appsettings.json")));
                if (json.RootElement.TryGetProperty("Server", out var server) &&
                    server.TryGetProperty("Url", out var configured) &&
                    configured.GetString() is { Length: > 0 } value)
                {
                    url = value;
                }
            }
            catch
            {
                // A missing or malformed settings file falls back to the default.
            }
        }

        url = string.IsNullOrWhiteSpace(url) ? "http://localhost:5000" : url.Split(';')[0].Trim();
        return url.Replace("0.0.0.0", "localhost").Replace("://+", "://localhost").Replace("://*", "://localhost");
    }

    internal static void StopServer()
    {
        try
        {
            if (server is { HasExited: false }) server.Kill(entireProcessTree: true);
        }
        catch
        {
            // The process may already be gone.
        }
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindow(string? className, string windowName);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr window, int command);

    private static void FocusExisting()
    {
        var window = FindWindow(null, Title);
        if (window == IntPtr.Zero) return;
        ShowWindow(window, 9); // SW_RESTORE
        SetForegroundWindow(window);
    }
}
