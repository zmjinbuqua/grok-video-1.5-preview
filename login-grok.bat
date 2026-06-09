@echo off
set "IMA2_CONFIG_DIR=%~dp0.ima2"
set "IMA2_GENERATED_DIR=%~dp0.ima2\generated"
set "NO_PROXY=127.0.0.1,localhost,::1"
set "no_proxy=127.0.0.1,localhost,::1"
set "IMA2_AUTO_PROXY=1"
set "IMA2_PORTABLE_NODE="
for /d %%D in ("%~dp0.ima2\tools\node-v*-win-*") do if exist "%%~fD\node.exe" set "IMA2_PORTABLE_NODE=%%~fD"
if defined IMA2_PORTABLE_NODE set "PATH=%IMA2_PORTABLE_NODE%;%PATH%"
for /f "usebackq delims=" %%P in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0detect-proxy.ps1"`) do set "IMA2_DETECTED_PROXY=%%P"
if defined IMA2_DETECTED_PROXY (
  set "HTTP_PROXY=%IMA2_DETECTED_PROXY%"
  set "HTTPS_PROXY=%IMA2_DETECTED_PROXY%"
  set "http_proxy=%IMA2_DETECTED_PROXY%"
  set "https_proxy=%IMA2_DETECTED_PROXY%"
  set "NODE_USE_ENV_PROXY=1"
  echo Detected proxy: %IMA2_DETECTED_PROXY%
) else (
  echo No local HTTP proxy detected. Using direct connection.
)
cd /d "%~dp0"
node_modules\.bin\progrok.cmd login --browser
pause
