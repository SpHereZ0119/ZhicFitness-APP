@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "ZHIC_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%ZHIC_NODE%" (
  "%ZHIC_NODE%" --test --test-concurrency=1 tests/*.test.mjs
) else (
  node --test --test-concurrency=1 tests/*.test.mjs
)
pause
