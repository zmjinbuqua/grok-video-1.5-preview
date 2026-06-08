@echo off
cd /d "%~dp0"
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0grok-account-pool.ps1" list
  set /p ACCOUNT_NAME=Switch to account:
) else (
  set "ACCOUNT_NAME=%~1"
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0grok-account-pool.ps1" switch "%ACCOUNT_NAME%"
pause
