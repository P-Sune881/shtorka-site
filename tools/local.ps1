# Проверка СВОИХ правок до отправки в GitHub: показывает папку site из этой рабочей папки,
# только на этом компьютере (без публичной ссылки). Можно запускать одновременно с основным сайтом.
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'шторКа — проверка моих правок'
$tools = $PSScriptRoot
$base  = Split-Path $tools -Parent
$site  = Join-Path $base 'site'

$port = 8110
while ($port -lt 8130) {
  $busy = $null
  try { $busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue } catch {}
  if (-not $busy) { break }
  $port++
}

$server = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList @(
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$(Join-Path $tools 'serve.ps1')`"", '-Root', "`"$site`"", '-Port', $port
)
Start-Sleep -Milliseconds 800
$local = "http://localhost:$port/"

Write-Host ''
Write-Host '  шторКа — проверка моих правок (видно только на этом компьютере)' -ForegroundColor Cyan
Write-Host ''
Write-Host "      $local" -ForegroundColor White
Write-Host ''
Write-Host '  Поменяли файл в папке site → F5 в браузере.' -ForegroundColor DarkGray
Write-Host '  Всё нравится → GitHub Desktop: Commit, потом Push. Тогда правки увидят все.' -ForegroundColor DarkGray
Write-Host ''
Start-Process $local
Read-Host '  Нажмите Enter, чтобы закрыть проверку'
Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
