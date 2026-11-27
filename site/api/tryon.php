<?php
/**
 * ИИ-примерка штор: прокси к Polza.ai (Nano Banana) для хостинга с PHP (Спринтхост).
 * Локально тот же адрес /api/tryon.php обслуживает tools/serve.ps1 — логика одинаковая.
 *
 * Вход (POST JSON): { photo: dataURL фото окна, fabric: dataURL образца ткани,
 *                     curtain: { type, kind, color, lift } }
 * Выход: { ok: true, image: url, seconds, cost } или { ok: false, error, message }
 *
 * Ключ Polza НЕ в этой папке: файл secret/polza_key.txt на уровень выше папки сайта
 * (на хостинге — рядом с public_html), либо переменная окружения POLZA_API_KEY.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
@set_time_limit(180);

$root    = dirname(__DIR__, 2);                 // папка над сайтом
$secret  = $root . '/secret';
$logFile = $secret . '/ai-tryon.log';

function reply(int $code, array $data): void {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function fail(int $code, string $error, string $message): void {
  reply($code, ['ok' => false, 'error' => $error, 'message' => $message]);
}
function logLine(string $file, string $line): void {
  if (is_dir(dirname($file))) @file_put_contents($file, date('Y-m-d H:i:s') . "  $line\n", FILE_APPEND | LOCK_EX);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'method', 'Нужен POST');

// ---------- настройки ----------
$cfg = json_decode((string)@file_get_contents(__DIR__ . '/config.json'), true);
if (!is_array($cfg)) fail(500, 'config', 'Не читается api/config.json');

$key = trim((string)getenv('POLZA_API_KEY'));
if ($key === '' && is_file($secret . '/polza_key.txt')) $key = trim((string)file_get_contents($secret . '/polza_key.txt'));
$key = preg_replace('/^\xEF\xBB\xBF/', '', $key);
if ($key === '' || stripos($key, 'ВСТАВЬТЕ') !== false) fail(500, 'no_key', 'Не найден ключ Polza (secret/polza_key.txt)');

// ---------- входные данные ----------
$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) > 8 * 1024 * 1024) fail(413, 'too_big', 'Слишком большой запрос');
$in = json_decode($raw, true);
if (!is_array($in)) fail(400, 'bad_json', 'Неверный формат запроса');

$isImage = function ($s): bool {
  if (!is_string($s) || strlen($s) > 6 * 1024 * 1024) return false;
  if (!preg_match('#^data:image/(jpeg|png|webp);base64,#', $s, $m)) return false;
  $b64 = substr($s, strlen($m[0]));
  return $b64 !== '' && strspn($b64, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=') === strlen($b64);
};
$photo  = $in['photo'] ?? null;
$fabric = $in['fabric'] ?? null;
if (!$isImage($photo) || !$isImage($fabric)) fail(400, 'bad_image', 'Нужны фото окна и образец ткани');

$c     = is_array($in['curtain'] ?? null) ? $in['curtain'] : [];
$type  = (string)($c['type'] ?? '');
$kind  = (string)($c['kind'] ?? '');
$color = (string)($c['color'] ?? '');
$lift  = max(0, min(100, (int)($c['lift'] ?? 30)));
if (!isset($cfg['prompts'][$type])) fail(400, 'bad_type', 'Неизвестный тип штор');
if (!isset($cfg['kinds'][$kind]))   fail(400, 'bad_kind', 'Неизвестная ткань');
if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) fail(400, 'bad_color', 'Неверный цвет');

// ---------- лимиты (файл в secret или во временной папке) ----------
$ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$limFile = (is_dir($secret) && is_writable($secret) ? $secret : sys_get_temp_dir()) . '/ai-tryon-limits.json';
$fh = @fopen($limFile, 'c+');
if ($fh && flock($fh, LOCK_EX)) {
  $lim  = json_decode((string)stream_get_contents($fh), true) ?: [];
  $now  = time();
  $day  = date('Y-m-d');
  if (($lim['day'] ?? '') !== $day) $lim = ['day' => $day, 'total' => 0, 'ip' => []];
  $hits = array_values(array_filter($lim['ip'][$ip] ?? [], fn($t) => $t > $now - 3600));
  $perIp  = (int)($cfg['limits']['perIpPerHour'] ?? 12);
  $perDay = (int)($cfg['limits']['perDay'] ?? 150);
  if ($lim['total'] >= $perDay) { flock($fh, LOCK_UN); fclose($fh); logLine($logFile, "LIMIT day  $ip"); fail(429, 'limit_day', 'Дневной лимит примерок исчерпан'); }
  if (count($hits) >= $perIp)   { flock($fh, LOCK_UN); fclose($fh); logLine($logFile, "LIMIT ip   $ip"); fail(429, 'limit_ip', 'Слишком много примерок подряд'); }
  $hits[] = $now;
  $lim['ip'][$ip] = $hits;
  $lim['total']++;
  foreach ($lim['ip'] as $k => $v) if (max($v) < $now - 3600) unset($lim['ip'][$k]);
  ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($lim)); fflush($fh);
  flock($fh, LOCK_UN); fclose($fh);
}

// ---------- промпт ----------
$prompt = strtr($cfg['prompts'][$type], ['{lift}' => (string)$lift, '{cover}' => (string)(100 - $lift)])
  . ' ' . strtr($cfg['fabric'], ['{kind}' => $cfg['kinds'][$kind], '{color}' => $color])
  . ' ' . $cfg['common'];

// ---------- запрос в Polza ----------
function polza(string $method, string $url, string $key, ?string $body, int $timeout): array {
  $ch = curl_init($url);
  $opts = [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => $timeout,
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $key, 'Content-Type: application/json', 'Accept: application/json'],
  ];
  if ($method === 'POST') { $opts[CURLOPT_POST] = true; $opts[CURLOPT_POSTFIELDS] = $body; }
  curl_setopt_array($ch, $opts);
  $res  = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err  = curl_error($ch);
  curl_close($ch);
  return [$code, $res === false ? null : json_decode((string)$res, true), $err, $res];
}

$endpoint = rtrim((string)($cfg['endpoint'] ?? 'https://polza.ai/api/v1/media'), '/');
$timeout  = (int)($cfg['timeoutSec'] ?? 120);
$started  = microtime(true);
$payload  = json_encode([
  'model'    => $cfg['model'],
  'async'    => false,
  'provider' => ['sort' => 'latency', 'allow_fallbacks' => true],
  'input'    => [
    'prompt' => $prompt,
    'images' => [['type' => 'base64', 'data' => $photo], ['type' => 'base64', 'data' => $fabric]],
  ],
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

[$code, $r, $err, $rawRes] = polza('POST', $endpoint, $key, $payload, $timeout);

// если ответ ещё не готов — опрашиваем GET /media/{id}
while ($code >= 200 && $code < 300 && is_array($r) && ($r['status'] ?? '') !== 'completed'
       && !in_array($r['status'] ?? '', ['failed', 'error', 'cancelled'], true)
       && !empty($r['id']) && microtime(true) - $started < $timeout) {
  sleep(2);
  [$code, $r, $err, $rawRes] = polza('GET', $endpoint . '/' . rawurlencode((string)$r['id']), $key, null, 30);
}

$sec   = round(microtime(true) - $started, 1);
$image = $r['data'][0]['url'] ?? $r['data']['url'] ?? $r['url'] ?? null;
$cost  = $r['usage']['cost_rub'] ?? null;

if (!$image) {
  $why = $err ?: ($r['error']['message'] ?? $r['message'] ?? substr((string)$rawRes, 0, 300));
  logLine($logFile, "FAIL  {$sec}s  http=$code  $ip  $why");
  $map = [401 => ['bad_key', 'Polza не принимает ключ'], 403 => ['bad_key', 'Polza не принимает ключ'],
          402 => ['no_money', 'На балансе Polza закончились деньги'], 429 => ['busy', 'Polza перегружена, повторите']];
  [$e, $m] = $map[$code] ?? ['upstream', 'Нейросеть не вернула картинку'];
  fail(502, $e, "$m ($why)");
}

logLine($logFile, "OK    {$sec}s  {$cost} руб  $type/$kind  $ip");
reply(200, ['ok' => true, 'image' => $image, 'seconds' => $sec, 'cost' => $cost]);
