' Lor Mentor local stack watchdog - hidden launcher.
'
' The LorMentorStackWatchdog scheduled task ticks every 2 minutes. Launching
' pwsh.exe directly from the task (even with -WindowStyle Hidden) still
' flashed a console window on every tick on this Windows 11 machine, where
' terminal windows are hosted by the default, delegated console host.
'
' wscript.exe is a GUI-subsystem process: WScript.Shell.Run with a window
' style of 0 starts the watchdog with its window hidden from the moment the
' process is created, so no console ever appears.
'
' Register the scheduled task against THIS launcher rather than pwsh.exe -
' see the registration snippet at the bottom of local-stack-watchdog.ps1.

Dim fso, shell, here, ps1, pwsh
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

here = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = fso.BuildPath(here, "local-stack-watchdog.ps1")

pwsh = "pwsh.exe"
Dim full
full = "C:\Program Files\PowerShell\7\pwsh.exe"
If fso.FileExists(full) Then pwsh = """" & full & """"

shell.Run pwsh & " -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
