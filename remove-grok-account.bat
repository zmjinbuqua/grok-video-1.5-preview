@echo off
cd /d "%~dp0"
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0grok-account-pool.ps1" list
  set /p ACCOUNT_NAME=Remove account:
) else (
  set "ACCOUNT_NAME=%~1"
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0grok-account-pool.ps1" remove "%ACCOUNT_NAME%"
pause
