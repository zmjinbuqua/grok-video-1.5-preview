$ErrorActionPreference = "SilentlyContinue"

function Normalize-ProxyUrl($raw) {
  $value = [string]$raw
  $value = $value.Trim()
  if (-not $value) { return $null }
  if ($value -match '^https?://') { return $value }
  if ($value -match '^\d+$') { return "http://127.0.0.1:$value" }
  if ($value -match '^[\w\.-]+:\d+$') { return "http://$value" }
  return $null
}

function Test-HttpProxy($proxyUrl) {
  try {
    $uri = [Uri]$proxyUrl
    $port = if ($uri.Port -gt 0) { $uri.Port } elseif ($uri.Scheme -eq "https") { 443 } else { 80 }
    $client = [System.Net.Sockets.TcpClient]::new()
    $task = $client.ConnectAsync($uri.Host, $port)
    if (-not $task.Wait(800)) { $client.Close(); return $false }
    $stream = $client.GetStream()
    $bytes = [System.Text.Encoding]::ASCII.GetBytes("CONNECT accounts.x.ai:443 HTTP/1.1`r`nHost: accounts.x.ai:443`r`n`r`n")
    $stream.Write($bytes, 0, $bytes.Length)
    $buffer = New-Object byte[] 64
    $readTask = $stream.ReadAsync($buffer, 0, $buffer.Length)
    if (-not $readTask.Wait(800)) { $client.Close(); return $false }
    $text = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $readTask.Result)
    $client.Close()
    return $text -match '^HTTP/\d'
  } catch {
    return $false
  }
}

$existing = Normalize-ProxyUrl($env:HTTPS_PROXY)
if (-not $existing) { $existing = Normalize-ProxyUrl($env:HTTP_PROXY) }
if ($existing -and (Test-HttpProxy $existing)) {
  Write-Output $existing
  exit 0
}

try {
  $settings = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
  if ($settings.ProxyEnable -eq 1 -and $settings.ProxyServer) {
    $raw = [string]$settings.ProxyServer
    $part = ($raw -split ';' | Where-Object { $_ -match '^https?=' } | Select-Object -First 1)
    if ($part) { $raw = $part -replace '^https?=', '' }
    $proxy = Normalize-ProxyUrl($raw)
    if ($proxy -and (Test-HttpProxy $proxy)) {
      Write-Output $proxy
      exit 0
    }
  }
} catch {}

foreach ($port in @(7890, 7892, 10809, 10808, 20171, 20170, 8080, 8118)) {
  $proxy = "http://127.0.0.1:$port"
  if (Test-HttpProxy $proxy) {
    Write-Output $proxy
    exit 0
  }
}
