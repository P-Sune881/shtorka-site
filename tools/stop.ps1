# Остановка сайта: гасим локальный сервер и туннель
param([switch]$Quiet)
$tools = $PSScriptRoot
$pids  = Join-Path $tools 'pids.txt'
if (Test-Path $pids) {
  Get-Content $pids | ForEach-Object {
    if ($_ -match '^\d+$') { Stop-Process -Id ([int]$_) -Force -ErrorAction SilentlyContinue }
  }
  Remove-Item $pids -Force -ErrorAction SilentlyContinue
}
# на всякий случай — туннель именно из этой папки
Get-Process cloudflared -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -eq (Join-Path $tools 'cloudflared.exe') } |
  Stop-Process -Force -ErrorAction SilentlyContinue
if (-not $Quiet) { Write-Host '  Сайт остановлен. Ссылка больше не работает.' -ForegroundColor Yellow }
