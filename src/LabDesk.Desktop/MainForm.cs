using System.Diagnostics;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace LabDesk.Desktop;

internal sealed class MainForm : Form
{
    private readonly WebView2 view = new() { Dock = DockStyle.Fill };
    private readonly string url;
    private bool ownsServer;

    public MainForm(string url, bool ownsServer)
    {
        this.url = url;
        this.ownsServer = ownsServer;

        Text = "G.S. LAB";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(1024, 700);
        Size = new Size(1440, 900);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);

        Controls.Add(view);
        Load += async (_, _) => await StartAsync();
        FormClosed += (_, _) => { if (ownsServer) Program.StopServer(); };
    }

    private async Task StartAsync()
    {
        try
        {
            // Keep the browser profile out of the application folder.
            var profile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "GSLab", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(null, profile);
            await view.EnsureCoreWebView2Async(environment);
        }
        catch
        {
            // No WebView2 runtime: use the default browser, and leave the server
            // running because the window is about to close.
            ownsServer = false;
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            Close();
            return;
        }

        var core = view.CoreWebView2;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.NewWindowRequested += (_, e) => e.Handled = true;
        view.Source = new Uri(url);
    }
}
