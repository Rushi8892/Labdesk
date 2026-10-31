' G.S. LAB desktop launcher.
' Starts LabDesk.Api.exe hidden if it is not already running, then opens the
' interface in its own window (Edge app mode, default browser as fallback).
Option Explicit

Const Url = "http://localhost:5000/"
Const ExeName = "LabDesk.Api.exe"

Dim sh, fso, root, exe, edge, i
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
exe = root & "\" & ExeName

If Not IsUp() Then
    If Not fso.FileExists(exe) Then
        MsgBox ExeName & " was not found in:" & vbCrLf & root, 16, "G.S. LAB"
        WScript.Quit
    End If
    sh.CurrentDirectory = root
    On Error Resume Next
    sh.Run """" & exe & """ --no-browser", 0, False
    If Err.Number <> 0 Then
        MsgBox "Windows blocked " & ExeName & "." & vbCrLf & vbCrLf & _
               "An Application Control policy (Smart App Control or AppLocker) " & _
               "does not allow this file on this PC.", 16, "G.S. LAB"
        WScript.Quit
    End If
    On Error GoTo 0
    For i = 1 To 40
        WScript.Sleep 500
        If IsUp() Then Exit For
    Next
End If

If Not IsUp() Then
    MsgBox "The application did not start." & vbCrLf & _
           "Open " & exe & " once to see the error, then try again.", 16, "G.S. LAB"
    WScript.Quit
End If

edge = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe"
If Not fso.FileExists(edge) Then
    edge = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe"
End If
If fso.FileExists(edge) Then
    sh.Run """" & edge & """ --app=" & Url, 1, False
Else
    sh.Run Url, 1, False
End If

Function IsUp()
    Dim http
    On Error Resume Next
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 400, 400, 800, 800
    http.open "GET", Url & "api/healthz", False
    http.send
    IsUp = (Err.Number = 0) And (http.status = 200)
    On Error GoTo 0
End Function
