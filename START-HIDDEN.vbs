Option Explicit

Dim shell, fso, root, nodePath, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
nodePath = "node.exe"
command = """" & nodePath & """ """" & root & "\server.mjs""""
shell.CurrentDirectory = root
shell.Run command, 0, False
WScript.Sleep 1200
shell.Run "http://127.0.0.1:4317/#fitness", 1, False
