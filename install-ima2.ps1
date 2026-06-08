$ErrorActionPreference = "Stop"

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Fail($message) {
  Write-Host ""
  Write-Host "ERROR: $message" -ForegroundColor Red
  exit 1
}

function Test-Command($name) {
  $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Get-NodeMajor {
  if (-not (Test-Command "node")) { return $null }
  $version = (& node -v).Trim()
  if ($version -match "^v(\d+)\.") { return [int]$Matches[1] }
  return $null
}

function Write-BatFile($path, $content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $encoding)
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigDir = Join-Path $Root ".ima2"
$GeneratedDir = Join-Path $ConfigDir "generated"
$DefaultProxy = "http://127.0.0.1:7892"

Write-Host "ima2-gen Grok 1.5 installer"
Write-Host "Install directory: $Root"

Write-Step "Checking Node.js"
$nodeMajor = Get-NodeMajor
if ($null -eq $nodeMajor -or $nodeMajor -lt 20) {
  Write-Host "Node.js 20+ is required."
  if (Test-Command "winget") {
    Write-Host "winget detected. Installing Node.js LTS..."
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    $nodeMajor = Get-NodeMajor
  }
  if ($null -eq $nodeMajor -or $nodeMajor -lt 20) {
    Fail "Please install Node.js 20+ from https://nodejs.org, then run this installer again."
  }
}
Write-Host "Node.js OK: $(& node -v)"

if (-not (Test-Command "npm")) {
  Fail "npm was not found. Reinstall Node.js LTS and try again."
}
Write-Host "npm OK: $(& npm -v)"

Write-Step "Preparing runtime folders"
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
New-Item -ItemType Directory -Force -Path $GeneratedDir | Out-Null

Write-Step "Installing project dependencies"
Set-Location $Root
if (Test-Path (Join-Path $Root "package-lock.json")) {
  npm ci
} else {
  npm install
}

Write-Step "Installing UI dependencies"
Set-Location (Join-Path $Root "ui")
if (Test-Path (Join-Path $Root "ui\package-lock.json")) {
  npm ci
} else {
  npm install
}
Set-Location $Root

Write-Step "Building server and UI"
npm run build:server
npm run ui:build

Write-Step "Writing local launch scripts"
$escapedRoot = $Root
$escapedConfig = $ConfigDir
$escapedGenerated = $GeneratedDir

$startBat = @"
@echo off
set "IMA2_PORT=3333"
set "IMA2_HOST=127.0.0.1"
set "IMA2_CONFIG_DIR=$escapedConfig"
set "IMA2_GENERATED_DIR=$escapedGenerated"
set "HTTP_PROXY=$DefaultProxy"
set "HTTPS_PROXY=$DefaultProxy"
set "http_proxy=$DefaultProxy"
set "https_proxy=$DefaultProxy"
set "NO_PROXY=127.0.0.1,localhost,::1"
set "no_proxy=127.0.0.1,localhost,::1"
set "NODE_USE_ENV_PROXY=1"

cd /d "$escapedRoot"
node bin\ima2.js serve
pause
"@

$loginBat = @"
@echo off
set "IMA2_CONFIG_DIR=$escapedConfig"
set "IMA2_GENERATED_DIR=$escapedGenerated"
set "HTTP_PROXY=$DefaultProxy"
set "HTTPS_PROXY=$DefaultProxy"
set "http_proxy=$DefaultProxy"
set "https_proxy=$DefaultProxy"
set "NO_PROXY=127.0.0.1,localhost,::1"
set "no_proxy=127.0.0.1,localhost,::1"
set "NODE_USE_ENV_PROXY=1"

cd /d "$escapedRoot"
node_modules\.bin\progrok.cmd login --device-code
pause
"@

$loginBrowserBat = @"
@echo off
set "IMA2_CONFIG_DIR=$escapedConfig"
set "IMA2_GENERATED_DIR=$escapedGenerated"
set "HTTP_PROXY=$DefaultProxy"
set "HTTPS_PROXY=$DefaultProxy"
set "http_proxy=$DefaultProxy"
set "https_proxy=$DefaultProxy"
set "NO_PROXY=127.0.0.1,localhost,::1"
set "no_proxy=127.0.0.1,localhost,::1"
set "NODE_USE_ENV_PROXY=1"

cd /d "$escapedRoot"
node_modules\.bin\progrok.cmd login --browser
pause
"@

Write-BatFile (Join-Path $Root "start-ima2.bat") $startBat
Write-BatFile (Join-Path $Root "login-grok.bat") $loginBat
Write-BatFile (Join-Path $Root "login-grok-browser.bat") $loginBrowserBat

Write-Step "Done"
Write-Host "1. Run login-grok.bat to sign in to Grok."
Write-Host "2. Run start-ima2.bat to start ima2."
Write-Host "3. Open http://127.0.0.1:3333"
Write-Host ""
Write-Host "Grok 1.5 guide: docs\GROK_1_5_VIDEO_CN.md"
