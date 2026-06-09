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

function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user;$env:Path"
}

function Get-InstallerProxy {
  $detect = Join-Path $Root "detect-proxy.ps1"
  if (-not (Test-Path $detect)) { return $null }
  try {
    $proxy = (& powershell -NoProfile -ExecutionPolicy Bypass -File $detect | Select-Object -First 1)
    if ($proxy) {
      $env:HTTP_PROXY = $proxy
      $env:HTTPS_PROXY = $proxy
      $env:http_proxy = $proxy
      $env:https_proxy = $proxy
      Write-Host "Detected proxy for installer: $proxy"
      return $proxy
    }
  } catch {}
  return $null
}

function Download-File {
  param(
    [string]$Url,
    [string]$OutFile,
    [string]$ProxyUrl
  )
  if ($ProxyUrl) {
    Invoke-WebRequest -Uri $Url -OutFile $OutFile -Proxy $ProxyUrl
  } else {
    Invoke-WebRequest -Uri $Url -OutFile $OutFile
  }
}

function Install-NodeMsi {
  param(
    [string]$RootDir,
    [string]$ProxyUrl
  )
  $nodeVersion = "v22.12.0"
  $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
  $toolsDir = Join-Path $RootDir ".ima2\tools"
  $msiPath = Join-Path $toolsDir "node-$nodeVersion-$arch.msi"
  New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
  $url = "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-$arch.msi"
  Write-Host "Downloading Node.js installer $nodeVersion..."
  Download-File -Url $url -OutFile $msiPath -ProxyUrl $ProxyUrl
  Write-Host "Installing Node.js silently..."
  $proc = Start-Process -FilePath "msiexec.exe" -ArgumentList @("/i", "`"$msiPath`"", "/qn", "/norestart") -Wait -PassThru
  if ($proc.ExitCode -ne 0) {
    throw "Node.js MSI installer failed with exit code $($proc.ExitCode)."
  }
  Refresh-Path
}

function Install-PortableNode {
  param(
    [string]$RootDir,
    [string]$ProxyUrl
  )
  $nodeVersion = "v22.12.0"
  $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
  $toolsDir = Join-Path $RootDir ".ima2\tools"
  $zipPath = Join-Path $toolsDir "node-$nodeVersion-win-$arch.zip"
  $extractDir = Join-Path $toolsDir "node-$nodeVersion-win-$arch"
  $nodeExe = Join-Path $extractDir "node.exe"
  New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
  if (-not (Test-Path $nodeExe)) {
    $url = "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-$arch.zip"
    Write-Host "Downloading portable Node.js $nodeVersion..."
    Download-File -Url $url -OutFile $zipPath -ProxyUrl $ProxyUrl
    if (Test-Path $extractDir) { Remove-Item -LiteralPath $extractDir -Recurse -Force }
    Expand-Archive -LiteralPath $zipPath -DestinationPath $toolsDir -Force
  }
  $env:Path = "$extractDir;$env:Path"
}

function Get-PortableNodeBatSnippet {
  return @'
set "IMA2_PORTABLE_NODE="
for /d %%D in ("%~dp0.ima2\tools\node-v*-win-*") do if exist "%%~fD\node.exe" set "IMA2_PORTABLE_NODE=%%~fD"
if defined IMA2_PORTABLE_NODE (
  set "PATH=%IMA2_PORTABLE_NODE%;%PATH%"
)
'@
}

function Write-BatFile($path, $content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $encoding)
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigDir = Join-Path $Root ".ima2"
$GeneratedDir = Join-Path $ConfigDir "generated"

Write-Host "ima2-gen Grok 1.5 installer"
Write-Host "Install directory: $Root"
$InstallerProxy = Get-InstallerProxy

Write-Step "Checking Node.js"
$nodeMajor = Get-NodeMajor
if ($null -eq $nodeMajor -or $nodeMajor -lt 20) {
  Write-Host "Node.js 20+ is required."
  if (Test-Command "winget") {
    try {
      Write-Host "winget detected. Installing Node.js LTS..."
      winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
      Refresh-Path
      $nodeMajor = Get-NodeMajor
    } catch {
      Write-Host "winget install did not complete: $($_.Exception.Message)"
    }
  }
  if ($null -eq $nodeMajor -or $nodeMajor -lt 20) {
    try {
      Write-Host "Trying direct Node.js MSI installation..."
      Install-NodeMsi -RootDir $Root -ProxyUrl $InstallerProxy
      $nodeMajor = Get-NodeMajor
    } catch {
      Write-Host "Direct MSI install did not complete: $($_.Exception.Message)"
    }
  }
  if ($null -eq $nodeMajor -or $nodeMajor -lt 20) {
    Write-Host "System Node.js is still unavailable. Installing portable Node.js into this project..."
    Install-PortableNode -RootDir $Root -ProxyUrl $InstallerProxy
    $nodeMajor = Get-NodeMajor
  }
  if ($null -eq $nodeMajor -or $nodeMajor -lt 20) {
    Fail "Could not install Node.js automatically. Check network access, then run this installer again."
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
$portableNodeBat = Get-PortableNodeBatSnippet
$proxyDetectBat = @'
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
'@

$startBat = @"
@echo off
$portableNodeBat
set "IMA2_PORT=3333"
set "IMA2_HOST=127.0.0.1"
set "IMA2_CONFIG_DIR=$escapedConfig"
set "IMA2_GENERATED_DIR=$escapedGenerated"
set "NO_PROXY=127.0.0.1,localhost,::1"
set "no_proxy=127.0.0.1,localhost,::1"
set "IMA2_AUTO_PROXY=1"
$proxyDetectBat

cd /d "$escapedRoot"
node bin\ima2.js serve
pause
"@

$loginBat = @"
@echo off
$portableNodeBat
set "IMA2_CONFIG_DIR=$escapedConfig"
set "IMA2_GENERATED_DIR=$escapedGenerated"
set "NO_PROXY=127.0.0.1,localhost,::1"
set "no_proxy=127.0.0.1,localhost,::1"
set "IMA2_AUTO_PROXY=1"
$proxyDetectBat

cd /d "$escapedRoot"
node_modules\.bin\progrok.cmd login --browser
pause
"@

$loginBrowserBat = @"
@echo off
$portableNodeBat
set "IMA2_CONFIG_DIR=$escapedConfig"
set "IMA2_GENERATED_DIR=$escapedGenerated"
set "NO_PROXY=127.0.0.1,localhost,::1"
set "no_proxy=127.0.0.1,localhost,::1"
set "IMA2_AUTO_PROXY=1"
$proxyDetectBat

cd /d "$escapedRoot"
node_modules\.bin\progrok.cmd login --browser
pause
"@

Write-BatFile (Join-Path $Root "start-ima2.bat") $startBat
Write-BatFile (Join-Path $Root "login-grok.bat") $loginBat
Write-BatFile (Join-Path $Root "login-grok-browser.bat") $loginBrowserBat

Write-Step "Done"
Write-Host "1. Run start-ima2.bat to start ima2."
Write-Host "2. Open http://127.0.0.1:3333"
Write-Host "3. In Settings -> Grok account pool, click the login button to add Grok accounts."
Write-Host ""
Write-Host "Grok 1.5 guide: docs\GROK_1_5_VIDEO_CN.md"
