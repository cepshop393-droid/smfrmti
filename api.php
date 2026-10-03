<?php
/**
 * CepStok sunucu API'si
 * Firmaların verilerini merkezi veritabanında tutar, cihazlar arasında eşitler,
 * ortak barkod havuzunu ve döviz kurlarını sağlar.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$CFG = require __DIR__ . '/config.php';

function out($data, int $code = 200): void { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function fail(string $msg, int $code = 400): void { out(['ok' => false, 'error' => $msg], $code); }
function now(): string { return gmdate('c'); }
function rid(int $n = 16): string { return bin2hex(random_bytes($n)); }

/* ---------- Veritabanı ---------- */
function db(): PDO {
    static $pdo = null; global $CFG;
    if ($pdo) return $pdo;
    try {
        if ($CFG['db'] === 'mysql') {
            $m = $CFG['mysql'];
            $pdo = new PDO("mysql:host={$m['host']};dbname={$m['name']};charset=utf8mb4", $m['user'], $m['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        } else {
            $dir = dirname($CFG['sqlite_path']);
            if (!is_dir($dir)) @mkdir($dir, 0755, true);
            if (!file_exists($dir . '/.htaccess')) @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
            if (!file_exists($dir . '/index.html')) @file_put_contents($dir . '/index.html', '');
            $pdo = new PDO('sqlite:' . $CFG['sqlite_path'], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $pdo->exec('PRAGMA busy_timeout=8000;'); $pdo->exec('PRAGMA journal_mode=DELETE;'); // paylaşımlı hostinglerde WAL dosya kilidi sorun çıkarabildiği için klasik günlük
        }
    } catch (Throwable $e) { fail('Veritabanına bağlanılamadı: ' . $e->getMessage() . ' (config.php ayarlarını kontrol edin)', 500); }
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    migrate($pdo);
    return $pdo;
}
function migrate(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS companies (id VARCHAR(40) PRIMARY KEY, code VARCHAR(64) NOT NULL UNIQUE, name VARCHAR(255), owner VARCHAR(80), seq BIGINT NOT NULL DEFAULT 0, created VARCHAR(40))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS records (company_id VARCHAR(40) NOT NULL, coll VARCHAR(40) NOT NULL, rid VARCHAR(100) NOT NULL, data LONGTEXT, deleted INT NOT NULL DEFAULT 0, seq BIGINT NOT NULL, updated VARCHAR(40), user_id VARCHAR(100), PRIMARY KEY (company_id, coll, rid))");
    try { $pdo->exec("CREATE INDEX idx_records_seq ON records (company_id, seq)"); } catch (Throwable $e) { }
    $pdo->exec("CREATE TABLE IF NOT EXISTS tokens (token VARCHAR(100) PRIMARY KEY, company_id VARCHAR(40) NOT NULL, user_id VARCHAR(100) NOT NULL, created VARCHAR(40), expires BIGINT)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS barcode_pool (barcode VARCHAR(64) NOT NULL, company_id VARCHAR(40) NOT NULL, name VARCHAR(255), unit VARCHAR(40), category VARCHAR(160), brand VARCHAR(160), updated VARCHAR(40), PRIMARY KEY (barcode, company_id))");
    $pdo->exec("CREATE TABLE IF NOT EXISTS kv (k VARCHAR(120) PRIMARY KEY, v LONGTEXT, at BIGINT)");
    // sürüm 3: abonelik süresi, paket, durum, kullanıcı sınırı
    $v = $pdo->query("SELECT v FROM kv WHERE k='schema_v'")->fetchColumn();
    if ((int)$v < 4) {
        foreach (["plan VARCHAR(40)", "expires BIGINT", "status VARCHAR(20)", "max_users INT", "note LONGTEXT", "last_seen BIGINT", "phone VARCHAR(60)", "extended INT"] as $col) { try { $pdo->exec("ALTER TABLE companies ADD COLUMN $col"); } catch (Throwable $e) { } }
        $pdo->prepare("REPLACE INTO kv (k, v, at) VALUES ('schema_v', '4', ?)")->execute([time()]);
    }
}
function kvGet(string $k) { $s = db()->prepare('SELECT v, at FROM kv WHERE k=?'); $s->execute([$k]); return $s->fetch() ?: null; }
function kvSet(string $k, string $v): void { db()->prepare('REPLACE INTO kv (k, v, at) VALUES (?,?,?)')->execute([$k, $v, time()]); }

/* ---------- Site ayarları (ana sayfa fiyat tablosu, deneme süresi, iletişim) ---------- */
function siteDefaults(): array {
    global $CFG;
    return [
        'trialDays' => 30, 'allowRegister' => (bool)$CFG['allow_register'], 'defaultPlan' => 'esnaf',
        'contact' => ['phone' => '+90 534 491 45 30', 'whatsapp' => '+905344914530', 'email' => '', 'note' => '30 günlük ücretsiz kullanım süreniz doldu. Kullanmaya devam etmek için WhatsApp’tan bize yazın.'],
        'priceNote' => 'Fiyatlara KDV dahil değildir.',
        'plans' => [
            ['id' => 'cep', 'name' => 'Cep', 'price' => 0, 'period' => '', 'desc' => 'Tek kasalı küçük işletmeler için', 'months' => 0, 'maxUsers' => 1, 'highlight' => false, 'cta' => '30 gün ücretsiz dene', 'features' => ['Hızlı satış ve fiş', 'Ürün ve stok takibi', 'Ortak barkod havuzu', 'Günlük rapor']],
            ['id' => 'esnaf', 'name' => 'Esnaf', 'price' => 449, 'period' => 'ay', 'desc' => 'Dükkân ve mağazalar için', 'months' => 1, 'maxUsers' => 5, 'highlight' => true, 'cta' => '30 gün ücretsiz dene', 'features' => ['Hızlı satış ve fiş', 'Ürün ve stok takibi', 'Ortak barkod havuzu', 'Günlük rapor', 'Cari hesap, fatura, e-belge XML', 'Dolar/TL ürün, otomatik kâr marjı', '3 bayi fiyatı', 'Kasa, banka, çek-senet', 'Excel içe ve dışa aktarım', 'Tüm raporlar']],
            ['id' => 'ticaret', 'name' => 'Ticaret', 'price' => 899, 'period' => 'ay', 'desc' => 'Bayi ağı ve saha satışı olanlar için', 'months' => 1, 'maxUsers' => 20, 'highlight' => false, 'cta' => '30 gün ücretsiz dene', 'features' => ['Hızlı satış ve fiş', 'Ürün ve stok takibi', 'Ortak barkod havuzu', 'Günlük rapor', 'Cari hesap, fatura, e-belge XML', 'Dolar/TL ürün, otomatik kâr marjı', '3 bayi fiyatı', 'Kasa, banka, çek-senet', 'Excel içe ve dışa aktarım', 'Tüm raporlar', 'Bayi konum ve ziyaret takibi', 'Bayi raporu', 'Çoklu şube ve depo', 'Üretim ve proje takibi']],
        ],
    ];
}
function site(): array { $r = kvGet('site'); $d = siteDefaults(); if (!$r) return $d; $v = json_decode($r['v'], true) ?: []; return array_replace($d, $v); }
function planOf(?string $id): ?array { foreach (site()['plans'] as $p) if (($p['id'] ?? '') === $id) return $p; return null; }
/** Firmanın kullanım hakkı */
function license(array $co): array {
    $exp = isset($co['expires']) && $co['expires'] !== null && $co['expires'] !== '' ? (int)$co['expires'] : null;
    $st = $co['status'] ?: 'active'; $left = $exp === null ? null : (int)ceil(($exp - time()) / 86400);
    $plan = planOf($co['plan'] ?? null);
    $site = site();
    return ['trial' => empty($co['extended']) && $exp !== null, 'plan' => $co['plan'] ?? '', 'planName' => $plan['name'] ?? ($co['plan'] ?: 'Sınırsız'), 'expires' => $exp ? gmdate('c', $exp) : null, 'daysLeft' => $left, 'status' => $st,
        'expired' => $exp !== null && $exp < time(), 'suspended' => $st === 'suspended', 'maxUsers' => $co['max_users'] !== null && $co['max_users'] !== '' ? (int)$co['max_users'] : null, 'contact' => $site['contact']];
}
function contactText(): string { $c = site()['contact']; return trim(implode(' · ', array_filter([$c['phone'] ?? '', $c['whatsapp'] ? 'WhatsApp ' . $c['whatsapp'] : '', $c['email'] ?? '']))); }

/* ---------- İstek ---------- */
$a = $_GET['a'] ?? '';
$raw = file_get_contents('php://input') ?: '';
$in = $raw !== '' ? (json_decode($raw, true) ?? []) : [];
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';

function auth(): array {
    global $in;
    $t = $_SERVER['HTTP_X_TOKEN'] ?? ($in['token'] ?? ($_GET['token'] ?? ''));
    if (!$t) fail('Oturum gerekli', 401);
    $s = db()->prepare('SELECT * FROM tokens WHERE token=?'); $s->execute([$t]); $row = $s->fetch();
    if (!$row || (int)$row['expires'] < time()) fail('Oturum süresi doldu, tekrar giriş yapın', 401);
    $c = db()->prepare('SELECT * FROM companies WHERE id=?'); $c->execute([$row['company_id']]); $co = $c->fetch();
    if (!$co) fail('Firma bulunamadı', 401);
    return ['token' => $t, 'company' => $co, 'user_id' => $row['user_id']];
}
function record(string $cid, string $coll, string $id) {
    $s = db()->prepare('SELECT data, deleted FROM records WHERE company_id=? AND coll=? AND rid=?'); $s->execute([$cid, $coll, $id]); $r = $s->fetch();
    return $r && !(int)$r['deleted'] ? json_decode($r['data'], true) : null;
}
function throttle(string $key): void {
    $r = kvGet('fail:' . $key);
    if ($r) { $d = json_decode($r['v'], true); if ($d['n'] >= 10 && time() - (int)$r['at'] < 600) fail('Çok fazla hatalı deneme. 10 dakika sonra tekrar deneyin.', 429); }
}
function failed(string $key): void { $r = kvGet('fail:' . $key); $n = $r && time() - (int)$r['at'] < 600 ? json_decode($r['v'], true)['n'] + 1 : 1; kvSet('fail:' . $key, json_encode(['n' => $n])); }
function slug(string $s): string { $s = mb_strtolower(trim($s), 'UTF-8'); $s = strtr($s, ['ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u', 'â' => 'a', 'î' => 'i', 'û' => 'u']); return trim(preg_replace('/[^a-z0-9]+/', '-', $s), '-'); }
function nextSeq(string $cid, int $n): int {
    db()->prepare('UPDATE companies SET seq = seq + ? WHERE id=?')->execute([$n, $cid]);
    $s = db()->prepare('SELECT seq FROM companies WHERE id=?'); $s->execute([$cid]); return (int)$s->fetchColumn() - $n;
}
function issueToken(string $cid, string $uid): string { global $CFG; $t = rid(24); db()->prepare('INSERT INTO tokens (token, company_id, user_id, created, expires) VALUES (?,?,?,?,?)')->execute([$t, $cid, $uid, now(), time() + 86400 * (int)$CFG['token_days']]); return $t; }
function publicUser(array $u): array { unset($u['pinHash'], $u['pin']); return $u; }

/* ---------- Maliyet gizliliği: "alış fiyatı ve kâr" yetkisi olmayan kullanıcılar ---------- */
function canCost(array $A): bool {
    if ($A['user_id'] === $A['company']['owner']) return true;
    $me = record($A['company']['id'], 'users', $A['user_id']); if (!$me) return false;
    if (($me['roleId'] ?? '') === 'r_admin') return true;
    $role = record($A['company']['id'], 'roles', $me['roleId'] ?? '');
    return $role && !empty($role['perms']['cost']['v']);
}
function cachedRates(): array { $c = kvGet('rates'); return $c ? (json_decode($c['v'], true) ?: []) : []; }
function rateOf(?string $cur, array $set, array $rates): float {
    if (!$cur || $cur === '₺') return 1.0;
    $man = (float)($set['rateManual'][$cur] ?? 0);
    if (($set['rateMode'] ?? '') === 'manual' && $man) return $man;
    $v = (float)($rates[$cur][($set['rateSide'] ?? '') === 'alis' ? 'alis' : 'satis'] ?? 0);
    return $v ?: $man;
}
function roundPrice(float $v, array $set): float {
    $r = (string)($set['priceRound'] ?? ''); if ($r === '' || !$v) return round($v, 2);
    if ($r === '0.99') return max(0.99, ceil($v) - 0.01);
    $st = (float)$r; return round(ceil($v / $st - 1e-9) * $st, 2);
}
function costTL(array $p, array $set, array $rates): float {
    $cur = $p['cur'] ?? '₺'; return $cur !== '₺' ? (float)($p['buyFx'] ?? 0) * rateOf($cur, $set, $rates) : (float)($p['buy'] ?? 0);
}
/** İstemcideki CS.applyPricing ile aynı hesap: maliyeti gizlenen kullanıcıya hazır fiyat gönderilir */
function priceProduct(array $p, array $set, array $rates): array {
    $cur = $p['cur'] ?? '₺'; $fx = $cur !== '₺'; $rate = rateOf($cur, $set, $rates); $buy = costTL($p, $set, $rates);
    $kdvMul = !empty($set['priceIncludesKdv']) ? 1 + (float)($p['kdv'] ?? 0) / 100 : 1;
    $fm = fn($m) => roundPrice($buy * (1 + (float)$m / 100) * $kdvMul, $set);
    if (!empty($p['autoPrice']) && isset($p['margin']) && $p['margin'] !== '') $p['sell'] = $fm($p['margin']);
    elseif ($fx && (float)($p['sellFx'] ?? 0) && $rate) $p['sell'] = roundPrice((float)$p['sellFx'] * $rate, $set);
    $p['prices'] = $p['prices'] ?? []; $p['prices'][0] = (float)($p['sell'] ?? 0);
    foreach (($p['dealers'] ?? []) as $i => $d) {
        if (!$d) continue;
        if (isset($d['m']) && $d['m'] !== '' && ((float)$d['m'] !== 0.0 || !(float)($d['p'] ?? 0))) $p['prices'][$i + 1] = $fm($d['m']);
        elseif ((float)($d['p'] ?? 0)) $p['prices'][$i + 1] = roundPrice((float)$d['p'] * ($fx ? $rate : 1), $set);
    }
    return $p;
}
const BUY_DOCS = ['alis', 'alis_iade', 'alis_irsaliye', 'alis_siparis'];
function hideCost(string $coll, ?array $d, array $set, array $rates): ?array {
    if ($d === null) return null;
    if ($coll === 'products') { $d = priceProduct($d, $set, $rates); unset($d['buy'], $d['buyFx'], $d['margin'], $d['costHist'], $d['priceHist'], $d['labor']); if (isset($d['dealers'])) foreach ($d['dealers'] as &$x) if (is_array($x)) unset($x['m']); unset($x); if (isset($d['recipe'])) $d['recipe'] = array_map(fn($r) => ['pid' => $r['pid'] ?? '', 'qty' => $r['qty'] ?? 0], $d['recipe']); }
    elseif ($coll === 'docs') { if (in_array($d['type'] ?? '', BUY_DOCS, true)) return null; foreach (($d['lines'] ?? []) as $k => $l) unset($d['lines'][$k]['cost']); }
    elseif ($coll === 'moves') { unset($d['cost']); if (in_array($d['type'] ?? '', BUY_DOCS, true)) unset($d['price']); }
    elseif ($coll === 'productions') { unset($d['material'], $d['labor'], $d['unitCost']); foreach (($d['used'] ?? []) as $k => $u) unset($d['used'][$k]['cost']); }
    elseif ($coll === 'counts' || $coll === 'transfers') { }
    return $d;
}
function metaSettings(string $cid): array { return record($cid, '_meta', 'settings') ?: []; }

/* ---------- Kurlar ---------- */
function num($v): float { $v = trim((string)$v); if (strpos($v, ',') !== false && strpos($v, '.') !== false) $v = str_replace('.', '', $v); return (float)str_replace(',', '.', $v); }
function httpPost(string $url, array $fields, array $headers): ?string {
    if (!function_exists('curl_init')) return null;
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($fields), CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_ENCODING => '', CURLOPT_HTTPHEADER => $headers, CURLOPT_FOLLOWLOCATION => true]);
    $r = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return $r !== false && $code === 200 ? $r : null;
}
function httpGet(string $url): ?string {
    if (function_exists('curl_init')) { $ch = curl_init($url); curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_FOLLOWLOCATION => true, CURLOPT_USERAGENT => 'Mozilla/5.0 CepStok']); $r = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch); return $r !== false && $code === 200 ? $r : null; }
    $r = @file_get_contents($url); return $r === false ? null : $r;
}
function fetchRates(): array {
    $h = httpPost('https://www.haremaltin.com/dashboard/ajax/doviz', ['dil_kodu' => 'tr'], [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept: application/json, text/javascript, */*; q=0.01', 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With: XMLHttpRequest', 'Origin: https://www.haremaltin.com', 'Referer: https://www.haremaltin.com/canli-piyasalar/']);
    if ($h) {
        $j = json_decode($h, true); $d = $j['data'] ?? null;
        if ($d && isset($d['USDTRY'])) {
            $out = ['source' => 'Harem Altın', 'at' => now()];
            foreach (['USD' => 'USDTRY', 'EUR' => 'EURTRY', 'GBP' => 'GBPTRY'] as $k => $code) if (isset($d[$code])) $out[$k] = ['alis' => num($d[$code]['alis']), 'satis' => num($d[$code]['satis'])];
            if (isset($d['ALTIN'])) $out['ALTIN'] = ['alis' => num($d['ALTIN']['alis']), 'satis' => num($d['ALTIN']['satis'])];
            if (($out['USD']['satis'] ?? 0) > 0) return $out;
        }
    }
    $x = httpGet('https://www.tcmb.gov.tr/kurlar/today.xml');
    if ($x && ($xml = @simplexml_load_string($x))) {
        $out = ['source' => 'TCMB (Harem Altın’a ulaşılamadı)', 'at' => now()];
        foreach ($xml->Currency as $c) { $k = (string)$c['CurrencyCode']; if (in_array($k, ['USD', 'EUR', 'GBP'])) $out[$k] = ['alis' => (float)$c->ForexBuying, 'satis' => (float)$c->ForexSelling]; }
        if (($out['USD']['satis'] ?? 0) > 0) return $out;
    }
    return [];
}

/* ---------- Uç noktalar ---------- */
switch ($a) {
case 'ping':
    out(['ok' => true, 'app' => 'cepstok', 'v' => 2, 'register' => (bool)$CFG['allow_register'], 'time' => now()]);

case 'register': {
    global $CFG;
    $SITE = site(); if (!$SITE['allowRegister'] && (!$CFG['register_key'] || ($in['key'] ?? '') !== $CFG['register_key'])) fail('Yeni firma kaydı şu anda kapalı. ' . contactText(), 403);
    $name = trim((string)($in['companyName'] ?? '')); $code = slug((string)($in['code'] ?? $name)); $user = trim((string)($in['username'] ?? '')); $pass = (string)($in['password'] ?? ''); $adminName = trim((string)($in['adminName'] ?? 'Yönetici'));
    if ($name === '' || $code === '' || $user === '' || strlen($pass) < 4) fail('Firma adı, firma kodu, kullanıcı adı ve en az 4 karakterli şifre gerekli.');
    throttle('reg:' . $ip);
    $s = db()->prepare('SELECT id FROM companies WHERE code=?'); $s->execute([$code]); if ($s->fetch()) fail('Bu firma kodu kullanılıyor, başka bir kod seçin.');
    $cid = 'c_' . rid(8); $uid = 'u_admin';
    $plan = planOf($SITE['defaultPlan']) ?? ($SITE['plans'][0] ?? ['id' => '', 'maxUsers' => null]); $trial = (int)$SITE['trialDays'];
    db()->prepare('INSERT INTO companies (id, code, name, owner, seq, created, plan, expires, status, max_users, phone) VALUES (?,?,?,?,0,?,?,?,?,?,?)')->execute([$cid, $code, $name, $uid, now(), $plan['id'] ?? '', $trial > 0 ? time() + $trial * 86400 : null, 'active', $plan['maxUsers'] ?? null, mb_substr((string)($in['phone'] ?? ''), 0, 60)]);
    $u = ['id' => $uid, 'name' => $adminName, 'username' => $user, 'pinHash' => password_hash($pass, PASSWORD_DEFAULT), 'roleId' => 'r_admin', 'active' => true];
    $seq = nextSeq($cid, 1);
    db()->prepare('REPLACE INTO records (company_id, coll, rid, data, deleted, seq, updated, user_id) VALUES (?,?,?,?,0,?,?,?)')->execute([$cid, 'users', $uid, json_encode($u, JSON_UNESCAPED_UNICODE), $seq + 1, now(), $uid]);
    failed('reg:' . $ip);
    $s = db()->prepare('SELECT * FROM companies WHERE id=?'); $s->execute([$cid]);
    out(['ok' => true, 'token' => issueToken($cid, $uid), 'company' => ['id' => $cid, 'code' => $code, 'name' => $name], 'user' => publicUser($u), 'fresh' => true, 'license' => license($s->fetch())]);
}

case 'login': {
    $code = slug((string)($in['code'] ?? '')); $user = trim((string)($in['username'] ?? '')); $pass = (string)($in['password'] ?? '');
    throttle('login:' . $ip . ':' . $code);
    $s = db()->prepare('SELECT * FROM companies WHERE code=?'); $s->execute([$code]); $co = $s->fetch();
    if (!$co) { failed('login:' . $ip . ':' . $code); fail('Firma kodu bulunamadı.', 404); }
    $s = db()->prepare("SELECT rid, data FROM records WHERE company_id=? AND coll='users' AND deleted=0"); $s->execute([$co['id']]);
    foreach ($s->fetchAll() as $r) {
        $u = json_decode($r['data'], true);
        if (mb_strtolower($u['username'] ?? '') !== mb_strtolower($user)) continue;
        if (($u['active'] ?? true) === false) fail('Bu kullanıcı pasif.', 403);
        $ok = isset($u['pinHash']) ? password_verify($pass, $u['pinHash']) : (isset($u['pin']) && hash_equals((string)$u['pin'], $pass));
        if (!$ok) break;
        $L = license($co); if ($L['suspended']) fail('Firmanızın hesabı askıya alındı. ' . contactText(), 403);
        out(['ok' => true, 'token' => issueToken($co['id'], $u['id']), 'company' => ['id' => $co['id'], 'code' => $co['code'], 'name' => $co['name']], 'user' => publicUser($u), 'license' => $L]);
    }
    failed('login:' . $ip . ':' . $code); fail('Kullanıcı adı ya da şifre hatalı.', 401);
}

case 'logout': { $A = auth(); db()->prepare('DELETE FROM tokens WHERE token=?')->execute([$A['token']]); out(['ok' => true]); }

case 'pull': {
    $A = auth(); $cid = $A['company']['id']; $since = (int)($in['since'] ?? 0); $limit = 4000; $L = license($A['company']);
    if ($L['suspended']) fail('Firmanızın hesabı askıya alındı. ' . contactText(), 403);
    if (time() - (int)($A['company']['last_seen'] ?? 0) > 60) db()->prepare('UPDATE companies SET last_seen=? WHERE id=?')->execute([time(), $cid]);
    $s = db()->prepare('SELECT coll, rid, data, deleted, seq FROM records WHERE company_id=? AND seq > ? ORDER BY seq LIMIT ' . $limit); $s->execute([$cid, $since]);
    $rows = []; $max = $since; $cc = canCost($A); $set = $cc ? [] : metaSettings($cid); $rt = $cc ? [] : cachedRates();
    foreach ($s->fetchAll() as $r) {
        $d = (int)$r['deleted'] ? null : json_decode($r['data'], true);
        if ($r['coll'] === 'users' && $d) $d = publicUser($d);
        if (!$cc && $d) { $d = hideCost($r['coll'], $d, $set, $rt); if ($d === null) { $rows[] = ['c' => $r['coll'], 'i' => $r['rid'], 'd' => null, 'x' => 1]; $max = max($max, (int)$r['seq']); continue; } }
        $rows[] = ['c' => $r['coll'], 'i' => $r['rid'], 'd' => $d, 'x' => (int)$r['deleted']]; $max = max($max, (int)$r['seq']);
    }
    out(['ok' => true, 'rows' => $rows, 'seq' => $max, 'more' => count($rows) === $limit, 'cost' => $cc, 'license' => $L, 'company' => ['id' => $cid, 'code' => $A['company']['code'], 'name' => $A['company']['name']], 'me' => $A['user_id']]);
}

case 'push': {
    $A = auth(); $cid = $A['company']['id']; $changes = $in['changes'] ?? []; $L = license($A['company']);
    if ($L['suspended']) fail('Firmanızın hesabı askıya alındı. ' . contactText(), 403);
    if ($L['expired']) fail('Kullanım süreniz ' . gmdate('d.m.Y', strtotime($L['expires'])) . ' tarihinde doldu; yeni kayıtlar sunucuya yazılamıyor. ' . contactText(), 402);
    if (!is_array($changes) || !$changes) out(['ok' => true, 'n' => 0]);
    if (count($changes) > 5000) fail('Tek seferde en fazla 5000 değişiklik gönderilebilir.');
    // yetki: kullanıcı ve rol kayıtlarını yalnızca ayar yetkisi olanlar değiştirebilir
    $me = record($cid, 'users', $A['user_id']); $role = $me ? record($cid, 'roles', $me['roleId'] ?? '') : null;
    $isOwner = $A['user_id'] === $A['company']['owner'];
    $canSettings = $isOwner || ($role && !empty($role['perms']['settings']['e']));
    $canCost = canCost($A); $setP = $canCost ? [] : metaSettings($cid); $rtP = $canCost ? [] : cachedRates();
    $maxU = $L['maxUsers']; $uq = db()->prepare("SELECT rid, data FROM records WHERE company_id=? AND coll='users' AND deleted=0"); $uq->execute([$cid]);
    $activeU = []; foreach ($uq->fetchAll() as $r) { $d0 = json_decode($r['data'], true); if (($d0['active'] ?? true) !== false) $activeU[$r['rid']] = true; } $limitHit = 0;
    $pdo = db(); $pdo->beginTransaction();
    try {
        $seq = nextSeq($cid, count($changes)); $up = $pdo->prepare('REPLACE INTO records (company_id, coll, rid, data, deleted, seq, updated, user_id) VALUES (?,?,?,?,?,?,?,?)');
        $n = 0; $denied = 0; $cats = null;
        foreach ($changes as $ch) {
            $coll = substr(preg_replace('/[^A-Za-z0-9_]/', '', (string)($ch['c'] ?? '')), 0, 40); $id = substr((string)($ch['i'] ?? ''), 0, 100); $del = !empty($ch['x']); $data = $ch['d'] ?? null;
            if ($coll === '' || $id === '') continue;
            if (in_array($coll, ['users', 'roles'], true) && !$canSettings) { $denied++; continue; }
            if (!$canCost && !$del && is_array($data)) {
                $old = record($cid, $coll, $id);
                if ($coll === 'products') { foreach (['buy', 'buyFx', 'margin', 'costHist', 'priceHist', 'labor'] as $f) { if ($old && array_key_exists($f, $old)) $data[$f] = $old[$f]; else unset($data[$f]); } if ($old && isset($old['dealers'])) foreach ($old['dealers'] as $i => $od) if (isset($od['m'])) $data['dealers'][$i]['m'] = $od['m']; if ($old && isset($old['recipe']) && isset($data['recipe'])) $data['recipe'] = $old['recipe']; }
                if ($coll === 'docs' && in_array($data['type'] ?? '', BUY_DOCS, true) && $old) $data = $old; // alış belgelerini değiştiremez
                if ($coll === 'docs') foreach (($data['lines'] ?? []) as $k => $l) { $prev = null; foreach (($old['lines'] ?? []) as $ol) if (($ol['pid'] ?? '') === ($l['pid'] ?? '#') && isset($ol['cost'])) { $prev = $ol['cost']; break; } $pr = !empty($l['pid']) ? record($cid, 'products', $l['pid']) : null; $data['lines'][$k]['cost'] = $prev ?? ($pr ? round(costTL($pr, $setP, $rtP), 4) : 0); }
                if ($coll === 'moves') { $pr = record($cid, 'products', $data['pid'] ?? ''); $data['cost'] = $old['cost'] ?? ($pr ? round(costTL($pr, $setP, $rtP), 4) : 0); }
                if ($coll === 'productions' && $old) foreach (['material', 'labor', 'unitCost', 'used'] as $f) if (isset($old[$f])) $data[$f] = $old[$f];
            }
            if ($coll === 'users' && !$del && is_array($data) && $maxU !== null && ($data['active'] ?? true) !== false && !isset($activeU[$id])) { if (count($activeU) >= $maxU) { $denied++; $limitHit++; continue; } $activeU[$id] = true; }
            if ($coll === 'users' && !$del && is_array($data)) {
                $old = record($cid, 'users', $id);
                if (!empty($data['pin'])) $data['pinHash'] = password_hash((string)$data['pin'], PASSWORD_DEFAULT);
                elseif ($old && isset($old['pinHash'])) $data['pinHash'] = $old['pinHash'];
                unset($data['pin']);
            }
            $seq++; $up->execute([$cid, $coll, $id, $del ? null : json_encode($data, JSON_UNESCAPED_UNICODE), $del ? 1 : 0, $seq, now(), $A['user_id']]); $n++;
            // ortak barkod havuzu: yalnızca ürün adı, birim, kategori ve marka paylaşılır (fiyat ve stok asla)
            if ($coll === 'products' && !$del && is_array($data)) {
                $codes = array_filter(array_merge([$data['barcode'] ?? ''], (array)($data['barcodes'] ?? [])), fn($b) => is_string($b) && preg_match('/^[0-9A-Za-z\-]{6,40}$/', $b));
                if ($codes) {
                    if ($cats === null) { $cats = []; $q = $pdo->prepare("SELECT rid, data FROM records WHERE company_id=? AND coll IN ('categories','brands') AND deleted=0"); $q->execute([$cid]); foreach ($q->fetchAll() as $r) $cats[$r['rid']] = json_decode($r['data'], true)['name'] ?? ''; }
                    $name = trim(($data['name'] ?? '') . (isset($data['attrs']) && is_array($data['attrs']) && $data['attrs'] ? ' — ' . implode(' / ', $data['attrs']) : ''));
                    foreach ($codes as $b) $pdo->prepare('REPLACE INTO barcode_pool (barcode, company_id, name, unit, category, brand, updated) VALUES (?,?,?,?,?,?,?)')->execute([$b, $cid, mb_substr($name, 0, 250), $data['unit'] ?? '', $cats[$data['cat'] ?? ''] ?? '', $cats[$data['brand'] ?? ''] ?? '', now()]);
                }
            }
            if ($coll === '_meta' && $id === 'company' && is_array($data) && !empty($data['name'])) $pdo->prepare('UPDATE companies SET name=? WHERE id=?')->execute([$data['name'], $cid]);
        }
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); fail('Kayıt hatası: ' . $e->getMessage(), 500); }
    out(['ok' => true, 'n' => $n, 'denied' => $denied, 'userLimit' => $limitHit ? $maxU : null]);
}

case 'barcode': {
    $A = auth(); $code = trim((string)($in['code'] ?? ($_GET['code'] ?? '')));
    if (!preg_match('/^[0-9A-Za-z\-]{6,40}$/', $code)) out(['ok' => true, 'found' => false]);
    $s = db()->prepare('SELECT name, unit, category, brand, COUNT(*) n FROM barcode_pool WHERE barcode=? GROUP BY name, unit, category, brand ORDER BY n DESC'); $s->execute([$code]); $r = $s->fetchAll();
    if (!$r) out(['ok' => true, 'found' => false]);
    out(['ok' => true, 'found' => true, 'name' => $r[0]['name'], 'unit' => $r[0]['unit'], 'category' => $r[0]['category'], 'brand' => $r[0]['brand'], 'users' => array_sum(array_column($r, 'n'))]);
}

case 'rates': {
    global $CFG; auth();
    $c = kvGet('rates'); $force = !empty($in['force']);
    if ($c && !$force && time() - (int)$c['at'] < (int)$CFG['rate_cache_seconds']) out(['ok' => true] + json_decode($c['v'], true));
    $r = fetchRates();
    if ($r) { kvSet('rates', json_encode($r)); out(['ok' => true] + $r); }
    if ($c) out(['ok' => true, 'stale' => true] + json_decode($c['v'], true));
    fail('Kur bilgisi alınamadı. Ayarlar > Döviz kurları bölümünden elle kur girebilirsiniz.', 502);
}

case 'site': {
    // ana sayfadaki fiyat tablosu için herkese açık bilgi
    $S = site(); out(['ok' => true, 'plans' => $S['plans'], 'trialDays' => (int)$S['trialDays'], 'allowRegister' => (bool)$S['allowRegister'], 'contact' => $S['contact'], 'priceNote' => $S['priceNote'] ?? '']);
}
case 'license': { $A = auth(); out(['ok' => true, 'license' => license($A['company'])]); }

/* ================= SÜPER YÖNETİCİ (site sahibi) ================= */
case 'sa_status': { global $CFG; out(['ok' => true, 'setup' => !kvGet('superadmin') && empty($CFG['admin_pass'])]); }
case 'sa_setup': {
    global $CFG; if (kvGet('superadmin') || !empty($CFG['admin_pass'])) fail('Yönetici zaten tanımlı.', 403);
    $u = trim((string)($in['user'] ?? '')); $p = (string)($in['pass'] ?? '');
    if ($u === '' || strlen($p) < 8) fail('Kullanıcı adı ve en az 8 karakterli şifre girin.');
    kvSet('superadmin', json_encode(['user' => $u, 'hash' => password_hash($p, PASSWORD_DEFAULT)]));
    $t = rid(24); kvSet('sa:' . $t, '1'); out(['ok' => true, 'token' => $t]);
}
case 'sa_login': {
    global $CFG; throttle('sa:' . $ip);
    $u = (string)($in['user'] ?? ''); $p = (string)($in['pass'] ?? ''); $sa = kvGet('superadmin'); $ok = false;
    if ($sa) { $d = json_decode($sa['v'], true); $ok = hash_equals($d['user'], $u) && password_verify($p, $d['hash']); }
    elseif (!empty($CFG['admin_pass'])) $ok = hash_equals((string)($CFG['admin_user'] ?? 'yonetici'), $u) && hash_equals((string)$CFG['admin_pass'], $p);
    if (!$ok) { failed('sa:' . $ip); fail('Kullanıcı adı ya da şifre hatalı.', 401); }
    $t = rid(24); kvSet('sa:' . $t, '1'); out(['ok' => true, 'token' => $t]);
}
default:
    if (strpos($a, 'sa_') !== 0) fail('Bilinmeyen işlem', 404);
    $t = $_SERVER['HTTP_X_ADMIN'] ?? ''; $r = $t ? kvGet('sa:' . $t) : null;
    if (!$r || time() - (int)$r['at'] > 12 * 3600) fail('Yönetici oturumu gerekli', 401);
    kvSet('sa:' . $t, '1'); // süreyi uzat
    $pdo = db();
    switch ($a) {
    case 'sa_dash': {
        $cos = $pdo->query('SELECT * FROM companies ORDER BY created DESC')->fetchAll();
        $uc = []; foreach ($pdo->query("SELECT company_id, data FROM records WHERE coll='users' AND deleted=0")->fetchAll() as $r) { $d = json_decode($r['data'], true); if (($d['active'] ?? true) !== false) $uc[$r['company_id']] = ($uc[$r['company_id']] ?? 0) + 1; }
        $rc = []; foreach ($pdo->query("SELECT company_id, COUNT(*) n FROM records WHERE deleted=0 GROUP BY company_id")->fetchAll() as $r) $rc[$r['company_id']] = (int)$r['n'];
        $pc = []; foreach ($pdo->query("SELECT company_id, COUNT(*) n FROM records WHERE coll='products' AND deleted=0 GROUP BY company_id")->fetchAll() as $r) $pc[$r['company_id']] = (int)$r['n'];
        $list = array_map(fn($c) => ['id' => $c['id'], 'code' => $c['code'], 'name' => $c['name'], 'created' => $c['created'], 'phone' => $c['phone'] ?? '', 'note' => $c['note'] ?? '', 'lastSeen' => $c['last_seen'] ? gmdate('c', (int)$c['last_seen']) : null, 'users' => $uc[$c['id']] ?? 0, 'records' => $rc[$c['id']] ?? 0, 'products' => $pc[$c['id']] ?? 0, 'license' => license($c)], $cos);
        out(['ok' => true, 'companies' => $list, 'site' => site(), 'pool' => (int)$pdo->query('SELECT COUNT(DISTINCT barcode) FROM barcode_pool')->fetchColumn()]);
    }
    case 'sa_company': {
        $id = (string)($in['id'] ?? ''); $s = $pdo->prepare('SELECT * FROM companies WHERE id=?'); $s->execute([$id]); $co = $s->fetch(); if (!$co) fail('Firma bulunamadı', 404);
        $set = []; $val = [];
        if (array_key_exists('addDays', $in) || array_key_exists('expires', $in)) { $set[] = 'extended=?'; $val[] = 1; }
        if (array_key_exists('addDays', $in)) { $base = max(time(), (int)($co['expires'] ?: time())); $set[] = 'expires=?'; $val[] = $base + (int)$in['addDays'] * 86400; }
        if (array_key_exists('expires', $in)) { $set[] = 'expires=?'; $val[] = $in['expires'] ? strtotime($in['expires'] . ' 23:59:59') : null; }
        if (isset($in['plan'])) { $set[] = 'plan=?'; $val[] = (string)$in['plan']; if (!array_key_exists('maxUsers', $in) && ($pl = planOf($in['plan']))) { $set[] = 'max_users=?'; $val[] = $pl['maxUsers'] ?? null; } }
        if (array_key_exists('maxUsers', $in)) { $set[] = 'max_users=?'; $val[] = $in['maxUsers'] === '' || $in['maxUsers'] === null ? null : (int)$in['maxUsers']; }
        if (isset($in['status'])) { $set[] = 'status=?'; $val[] = $in['status'] === 'suspended' ? 'suspended' : 'active'; if ($in['status'] === 'suspended') $pdo->prepare('DELETE FROM tokens WHERE company_id=?')->execute([$id]); }
        foreach (['note' => 'note', 'name' => 'name', 'phone' => 'phone'] as $k => $col) if (isset($in[$k])) { $set[] = "$col=?"; $val[] = (string)$in[$k]; }
        if ($set) { $val[] = $id; $pdo->prepare('UPDATE companies SET ' . implode(',', $set) . ' WHERE id=?')->execute($val); }
        $s->execute([$id]); out(['ok' => true, 'license' => license($s->fetch())]);
    }
    case 'sa_resetpass': {
        $id = (string)($in['id'] ?? ''); $pass = (string)($in['pass'] ?? ''); if (strlen($pass) < 4) fail('Şifre en az 4 karakter olmalı.');
        $s = $pdo->prepare('SELECT * FROM companies WHERE id=?'); $s->execute([$id]); $co = $s->fetch(); if (!$co) fail('Firma bulunamadı', 404);
        $u = record($id, 'users', $co['owner']); if (!$u) fail('Firma yöneticisi bulunamadı', 404);
        $u['pinHash'] = password_hash($pass, PASSWORD_DEFAULT); $u['active'] = true; $seq = nextSeq($id, 1) + 1;
        $pdo->prepare('REPLACE INTO records (company_id, coll, rid, data, deleted, seq, updated, user_id) VALUES (?,?,?,?,0,?,?,?)')->execute([$id, 'users', $co['owner'], json_encode($u, JSON_UNESCAPED_UNICODE), $seq, now(), 'superadmin']);
        out(['ok' => true, 'username' => $u['username']]);
    }
    case 'sa_delete': {
        $id = (string)($in['id'] ?? ''); $s = $pdo->prepare('SELECT code FROM companies WHERE id=?'); $s->execute([$id]); $code = $s->fetchColumn();
        if (!$code || ($in['confirm'] ?? '') !== $code) fail('Silmek için firma kodunu doğru yazın.');
        foreach (['records', 'tokens', 'barcode_pool'] as $tb) $pdo->prepare("DELETE FROM $tb WHERE company_id=?")->execute([$id]);
        $pdo->prepare('DELETE FROM companies WHERE id=?')->execute([$id]); out(['ok' => true]);
    }
    case 'sa_site': {
        $S = $in['site'] ?? null; if (!is_array($S)) fail('Geçersiz veri');
        $clean = ['trialDays' => max(0, (int)($S['trialDays'] ?? 30)), 'allowRegister' => !empty($S['allowRegister']), 'defaultPlan' => (string)($S['defaultPlan'] ?? ''), 'priceNote' => mb_substr((string)($S['priceNote'] ?? ''), 0, 300),
            'contact' => ['phone' => mb_substr((string)($S['contact']['phone'] ?? ''), 0, 60), 'whatsapp' => mb_substr((string)($S['contact']['whatsapp'] ?? ''), 0, 60), 'email' => mb_substr((string)($S['contact']['email'] ?? ''), 0, 120), 'note' => mb_substr((string)($S['contact']['note'] ?? ''), 0, 300)],
            'plans' => array_values(array_map(fn($p) => ['id' => substr(preg_replace('/[^a-z0-9_-]/', '', strtolower((string)($p['id'] ?? ''))) ?: rid(3), 0, 30), 'name' => mb_substr((string)($p['name'] ?? ''), 0, 60), 'price' => (float)($p['price'] ?? 0), 'oldPrice' => (float)($p['oldPrice'] ?? 0), 'period' => mb_substr((string)($p['period'] ?? ''), 0, 30), 'desc' => mb_substr((string)($p['desc'] ?? ''), 0, 200), 'months' => (int)($p['months'] ?? 0), 'maxUsers' => ($p['maxUsers'] ?? '') === '' ? null : (int)$p['maxUsers'], 'highlight' => !empty($p['highlight']), 'cta' => mb_substr((string)($p['cta'] ?? ''), 0, 60), 'features' => array_values(array_filter(array_map(fn($f) => mb_substr(trim((string)$f), 0, 120), (array)($p['features'] ?? [])))), 'hidden' => !empty($p['hidden'])], array_slice((array)($S['plans'] ?? []), 0, 8)))];
        kvSet('site', json_encode($clean, JSON_UNESCAPED_UNICODE)); out(['ok' => true, 'site' => site()]);
    }
    case 'sa_password': {
        $p = (string)($in['pass'] ?? ''); $u = trim((string)($in['user'] ?? '')); if ($u === '' || strlen($p) < 8) fail('En az 8 karakterli şifre girin.');
        kvSet('superadmin', json_encode(['user' => $u, 'hash' => password_hash($p, PASSWORD_DEFAULT)])); out(['ok' => true]);
    }
    case 'sa_logout': { $pdo->prepare('DELETE FROM kv WHERE k=?')->execute(['sa:' . $t]); out(['ok' => true]); }
    default: fail('Bilinmeyen işlem', 404);
    }

case 'check': {
    // kurulum kontrolü
    $r = ['php' => PHP_VERSION, 'pdo_sqlite' => extension_loaded('pdo_sqlite'), 'pdo_mysql' => extension_loaded('pdo_mysql'), 'curl' => function_exists('curl_init'), 'db' => $CFG['db']];
    try { db(); $r['db_ok'] = true; } catch (Throwable $e) { $r['db_ok'] = false; }
    $r['rates'] = fetchRates() ? 'ok' : 'ulaşılamadı';
    out(['ok' => true] + $r);
}

}
