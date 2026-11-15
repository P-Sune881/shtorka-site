# Простой веб-сервер для папки site (без установки программ, только PowerShell)
param(
  [string]$Root,
  [int]$Port = 8080
)

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.htm' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8';  '.js'  = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'
  '.png'  = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'
  '.gif'  = 'image/gif'; '.ico' = 'image/x-icon'; '.avif' = 'image/avif'
  '.woff' = 'font/woff'; '.woff2' = 'font/woff2'; '.mp4' = 'video/mp4'; '.txt' = 'text/plain; charset=utf-8'
}

$rootFull = [System.IO.Path]::GetFullPath($Root)
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path.EndsWith('/')) { $path += 'index.html' }
    $file = [System.IO.Path]::GetFullPath((Join-Path $rootFull $path.TrimStart('/')))

    # не выпускаем запросы за пределы папки site
    if (-not $file.StartsWith($rootFull) -or -not (Test-Path $file -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes('404 — файл не найден')
      $res.ContentType = 'text/plain; charset=utf-8'
    } else {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-cache')   # правки видны сразу после обновления страницы
      $bytes = [System.IO.File]::ReadAllBytes($file)
    }
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.OutputStream.Close()
  } catch {
    try { $res.Abort() } catch {}
  }
}
