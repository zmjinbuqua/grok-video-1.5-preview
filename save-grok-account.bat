@echo off
cd /d "%~dp0"
if "%~1"=="" (
  set /p ACCOUNT_NAME=Account name:
) else (
  set "ACCOUNT_NAME=%~1"
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0grok-account-pool.ps1" save "%ACCOUNT_NAME%"
pause
