# Запуск сайта на этом компьютере + публичная ссылка через Cloudflare Tunnel.
# Если папка подключена к GitHub, показывается ОБЩАЯ версия с GitHub (папка _online):
# она сама подтягивает свежие правки каждые 30 секунд. В _online никто не работает руками.
# Если GitHub ещё не подключён или нет Git, показывается папка site, как раньше.
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$Host.UI.RawUI.WindowTitle = 'шторКа — сайт запущен'
$tools  = $PSScriptRoot
$base   = Split-Path $tools -Parent
$online = Join-Path $base '_online'
$cf     = Join-Path $tools 'cloudflared.exe'
$log    = Join-Path $tools 'tunnel.log'
$pids   = Join-Path $tools 'pids.txt'
$every  = 30   # как часто проверять GitHub, секунд

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }

function Find-Git {
  $cmd = Get-Command git -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @("$env:ProgramFiles\Git\cmd\git.exe", "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe")) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Git-Run([string[]]$GitArgs) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try {
    $out = & $script:git @GitArgs 2>&1 | ForEach-Object { "$_" }
    return @{ Code = $LASTEXITCODE; Out = (($out | Where-Object { $_ }) -join "`n") }
  } finally { $ErrorActionPreference = $old }
}

function Sync-Online {
  $env:GIT_TERMINAL_PROMPT = '0'
  $f = Git-Run @('-C', $online, 'fetch', '--quiet', 'origin')
  if ($f.Code -ne 0) {
    if (-not $script:offline) { $script:offline = $true; return 'нет связи с GitHub, показываю последнюю скачанную версию' }
    return $null
  }
  $script:offline = $false
  $a = (Git-Run @('-C', $online, 'rev-parse', 'HEAD')).Out.Trim()
  $b = (Git-Run @('-C', $online, 'rev-parse', 'origin/HEAD')).Out.Trim()
  if ($a -eq $b) { return $null }
  $r = Git-Run @('-C', $online, 'reset', '--hard', '--quiet', 'origin/HEAD')
  if ($r.Code -ne 0) { return "не удалось обновить: $($r.Out)" }
  $s = (Git-Run @('-C', $online, 'log', '-1', '--format=%an — %s')).Out.Trim()
  return "сайт обновлён: $s  (обновите страницу, F5)"
}

Say ''
Say '  шторКа — запуск сайта' 'Cyan'
Say '  ─────────────────────────────────' 'DarkCyan'

# если сайт уже был запущен — сначала гасим старый
& (Join-Path $tools 'stop.ps1') -Quiet

# 0. откуда показывать сайт: общая версия с GitHub или папка site
$site   = Join-Path $base 'site'
$syncOn = $false
$git    = Find-Git
if ($git) {
  $rem = Git-Run @('-C', $base, 'remote', 'get-url', 'origin')
  if ($rem.Code -eq 0 -and $rem.Out) {
    $remote = $rem.Out.Trim()
    if (-not (Test-Path (Join-Path $online '.git'))) {
      Say '  Первый запуск с GitHub: скачиваю общую версию в папку _online...' 'Yellow'
      Say '  (если откроется окно входа в GitHub — войдите, это один раз)' 'DarkGray'
      if (Test-Path $online) { Remove-Item $online -Recurse -Force }
      $c = Git-Run @('clone', '--quiet', $remote, $online)
      if ($c.Code -ne 0) { Say "  Не получилось скачать с GitHub: $($c.Out)" 'Red' }
    } else {
      Git-Run @('-C', $online, 'remote', 'set-url', 'origin', $remote) | Out-Null
    }
    if (Test-Path (Join-Path $online 'site\index.html')) {
      $site = Join-Path $online 'site'
      $syncOn = $true
      $m = Sync-Online
      Say '  Показываю ОБЩУЮ версию с GitHub — обновляется сама каждые 30 секунд.' 'Green'
    } else {
      Say '  Показываю папку site (общая версия с GitHub недоступна).' 'Yellow'
    }
  } else {
    Say '  GitHub к папке ещё не подключён — показываю папку site.' 'DarkGray'
  }
} else {
  Say '  Git не найден — показываю папку site.' 'Yellow'
  Say '  Чтобы показывать общую версию с GitHub, установите Git for Windows: https://git-scm.com/download/win' 'DarkGray'
}

# 1. cloudflared (скачивается один раз, ~60 МБ)
if (-not (Test-Path $cf)) {
  Say '  Первый запуск: скачиваю cloudflared (один раз)...' 'Yellow'
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
    Invoke-WebRequest -Uri $url -OutFile $cf -UseBasicParsing
  } catch {
    Say '  Не получилось скачать cloudflared. Проверьте интернет (или включите zapret) и запустите ещё раз.' 'Red'
    Say "  Можно скачать вручную: $url и положить файл в папку tools под именем cloudflared.exe" 'Red'
    Read-Host '  Нажмите Enter, чтобы закрыть'
    exit 1
  }
}

# 2. свободный порт
$port = 8080
while ($port -lt 8100) {
  $busy = $null
  try { $busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue } catch {}
  if (-not $busy) { break }
  $port++
}

# 3. локальный сервер (скрытое окно)
$server = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList @(
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$(Join-Path $tools 'serve.ps1')`"", '-Root', "`"$site`"", '-Port', $port
)
Start-Sleep -Milliseconds 800
$local = "http://localhost:$port/"
Say "  Сайт на этом компьютере: $local" 'Green'

# 4. туннель — публичная ссылка
if (Test-Path $log) { Remove-Item $log -Force }
$tunnel = Start-Process $cf -NoNewWindow -PassThru -RedirectStandardError $log -ArgumentList @(
  'tunnel', '--no-autoupdate', '--url', "http://localhost:$port", '--http-host-header', "localhost:$port"
)
"$($server.Id)`n$($tunnel.Id)" | Set-Content $pids

Say '  Получаю публичную ссылку (5–20 секунд)...' 'Yellow'
$public = $null
for ($i = 0; $i -lt 60 -and -not $public; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Path $log) {
    $m = $null
    try { $m = Select-String -Path $log -Pattern 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1 } catch {}
    if ($m) { $public = $m.Matches[0].Value }
  }
  if ($tunnel.HasExited) { break }
}

Say ''
if ($public) {
  Set-Clipboard -Value $public
  $public | Set-Content (Join-Path $base 'ссылка.txt') -Encoding UTF8
  Say '  ССЫЛКА ДЛЯ КЛИЕНТА И САНИ (уже скопирована — просто вставьте в чат):' 'Cyan'
  Say ''
  Say "      $public" 'White'
  Say ''
  Say '  Ссылка работает, пока открыто это окно и включён компьютер.' 'Gray'
  Say '  При каждом новом запуске ссылка будет новой.' 'Gray'
  Start-Process $public
} else {
  Say '  Публичную ссылку получить не удалось — сайт открыт только на этом компьютере.' 'Red'
  Say "  Подробности в файле: $log" 'DarkGray'
  Say '  Чаще всего помогает: проверить интернет / включить zapret и запустить снова.' 'DarkGray'
  Start-Process $local
}

Say ''
if ($syncOn) {
  Say '  Правки появляются сами после Push в GitHub Desktop (до 30 секунд), потом F5.' 'DarkGray'
} else {
  Say '  Правки в папке site видны сразу — просто обновите страницу (F5).' 'DarkGray'
}
Say ''
Say '  Нажмите Enter, чтобы ОСТАНОВИТЬ сайт' 'White'
Say ''

# 5. ждём Enter; заодно раз в 30 секунд подтягиваем свежую версию с GitHub
$next = (Get-Date).AddSeconds($every)
while ($true) {
  if ($syncOn -and (Get-Date) -ge $next) {
    $msg = Sync-Online
    if ($msg) { Say "  $(Get-Date -Format 'HH:mm')  $msg" 'Green' }
    $next = (Get-Date).AddSeconds($every)
  }
  $key = $null
  try { if ([Console]::KeyAvailable) { $key = [Console]::ReadKey($true) } } catch {}
  if ($key -and $key.Key -eq 'Enter') { break }
  Start-Sleep -Milliseconds 300
}
& (Join-Path $tools 'stop.ps1')
