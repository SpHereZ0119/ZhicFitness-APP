@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "ZHIC_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%ZHIC_NODE%" (
  "%ZHIC_NODE%" server.mjs --open
) else (
  node server.mjs --open
)
if errorlevel 1 pause
