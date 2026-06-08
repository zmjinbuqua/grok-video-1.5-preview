param(
  [Parameter(Position = 0)]
  [ValidateSet("list", "save", "switch", "current", "remove", "help")]
  [string]$Action = "help",

  [Parameter(Position = 1)]
  [string]$Name
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PoolDir = Join-Path $Root ".grok-accounts"
$CurrentFile = Join-Path $PoolDir "current-account.txt"
$ProgrokDir = Join-Path $HOME ".progrok"
$ProgrokAuth = Join-Path $ProgrokDir "auth.json"

function Write-Usage {
  Write-Host ""
  Write-Host "Grok account pool"
  Write-Host ""
  Write-Host "Usage:"
  Write-Host "  .\grok-account-pool.ps1 list"
  Write-Host "  .\grok-account-pool.ps1 save <account-name>"
  Write-Host "  .\grok-account-pool.ps1 switch <account-name>"
  Write-Host "  .\grok-account-pool.ps1 current"
  Write-Host "  .\grok-account-pool.ps1 remove <account-name>"
  Write-Host ""
}

function Require-Name {
  if (-not $Name -or -not $Name.Trim()) {
    throw "Account name is required."
  }
  if ($Name -notmatch "^[a-zA-Z0-9._-]+$") {
    throw "Account name can only contain letters, numbers, dot, underscore, and dash."
  }
}

function Account-Path([string]$accountName) {
  Join-Path $PoolDir "$accountName.json"
}

function Read-AccountEmail([string]$path) {
  try {
    $json = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if ($json.email) { return [string]$json.email }
    return "(email unknown)"
  } catch {
    return "(invalid auth file)"
  }
}

function Ensure-Pool {
  New-Item -ItemType Directory -Force -Path $PoolDir | Out-Null
}

switch ($Action) {
  "help" {
    Write-Usage
  }
  "list" {
    Ensure-Pool
    $current = if (Test-Path $CurrentFile) { (Get-Content -LiteralPath $CurrentFile -Raw).Trim() } else { "" }
    $files = Get-ChildItem -LiteralPath $PoolDir -Filter "*.json" -File -ErrorAction SilentlyContinue | Sort-Object Name
    if (-not $files) {
      Write-Host "No saved Grok accounts."
      Write-Host "Run: login-grok.bat, then save-grok-account.bat <name>"
      exit 0
    }
    foreach ($file in $files) {
      $account = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
      $mark = if ($account -eq $current) { "*" } else { " " }
      $email = Read-AccountEmail $file.FullName
      Write-Host "$mark $account`t$email"
    }
  }
  "save" {
    Require-Name
    if (-not (Test-Path $ProgrokAuth)) {
      throw "No current Grok login found at $ProgrokAuth. Run login-grok.bat first."
    }
    Ensure-Pool
    $target = Account-Path $Name
    Copy-Item -LiteralPath $ProgrokAuth -Destination $target -Force
    Set-Content -LiteralPath $CurrentFile -Value $Name -NoNewline
    Write-Host "Saved current Grok login as '$Name'."
    Write-Host "Pool file: $target"
  }
  "switch" {
    Require-Name
    $source = Account-Path $Name
    if (-not (Test-Path $source)) {
      throw "Account '$Name' was not found in $PoolDir."
    }
    New-Item -ItemType Directory -Force -Path $ProgrokDir | Out-Null
    Copy-Item -LiteralPath $source -Destination $ProgrokAuth -Force
    Set-Content -LiteralPath $CurrentFile -Value $Name -NoNewline
    $email = Read-AccountEmail $source
    Write-Host "Switched Grok account to '$Name' ($email)."
    Write-Host "Restart start-ima2.bat if the service is already running."
  }
  "current" {
    $current = if (Test-Path $CurrentFile) { (Get-Content -LiteralPath $CurrentFile -Raw).Trim() } else { "" }
    if ($current) {
      $path = Account-Path $current
      $email = if (Test-Path $path) { Read-AccountEmail $path } else { "(pool file missing)" }
      Write-Host "$current`t$email"
    } elseif (Test-Path $ProgrokAuth) {
      $email = Read-AccountEmail $ProgrokAuth
      Write-Host "Current ~/.progrok/auth.json exists but is not saved in the pool. Email: $email"
    } else {
      Write-Host "No current Grok login found."
    }
  }
  "remove" {
    Require-Name
    $target = Account-Path $Name
    if (-not (Test-Path $target)) {
      throw "Account '$Name' was not found in $PoolDir."
    }
    Remove-Item -LiteralPath $target -Force
    $current = if (Test-Path $CurrentFile) { (Get-Content -LiteralPath $CurrentFile -Raw).Trim() } else { "" }
    if ($current -eq $Name) {
      Remove-Item -LiteralPath $CurrentFile -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Removed '$Name' from the Grok account pool."
  }
}
