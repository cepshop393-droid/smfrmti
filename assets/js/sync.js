/* CepStok — sunucu modu: giriş, merkezi veritabanıyla eşitleme, çevrimdışı kuyruk, barkod havuzu */
(function () {
  const { $, esc } = CS;
  const META = ['company', 'settings', 'units', 'contactCats', 'expenseCats', 'incomeCats', 'integrations'];
  const SESSION = 'cepstok:srv';
  let snap = new Map(); let queue = new Map(); let seq = 0; let pushing = false; let pullTimer; let online = true; let lastErr = '';

  CS.server = null; // { token, company:{id,code,name}, userId }
  CS.license = null;
  CS.setLicense = function (L) { const changed = JSON.stringify(L) !== JSON.stringify(CS.license); CS.license = L; if (CS.server) CS.ls.set('cepstok:lic:' + CS.server.company.id, L); if (changed && CS.renderLicense) CS.renderLicense(); };
  const K = (n) => `cepstok:s${n}:${CS.server.company.id}`;

  /* ---------- HTTP ---------- */
  CS.api = async function (action, body = {}, timeout = 20000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch('api.php?a=' + action, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(CS.server?.token ? { 'X-Token': CS.server.token } : {}) }, body: JSON.stringify(body), signal: ctl.signal, cache: 'no-store' });
      let j; try { j = await r.json(); } catch (e) { throw new Error('Sunucu yanıtı okunamadı (' + r.status + '). PHP çalışıyor mu?'); }
      if (r.status === 401 && CS.server && action !== 'login') { setOnline(true); CS.toast('Oturumunuzun süresi doldu, tekrar giriş yapın.', 'bad', 5000); CS.serverLogout(true); throw new Error(j.error); }
      if (r.status === 402 && CS.server) { setOnline(true); CS.setLicense({ ...(CS.license || {}), expired: true, daysLeft: Math.min(0, CS.license?.daysLeft ?? 0) }); }
      if (!j.ok) { const e = new Error(j.error || 'Hata'); e.status = r.status; throw e; }
      if (j.license) CS.setLicense(j.license);
      setOnline(true); return j;
    } catch (e) { if (e.name === 'AbortError' || e instanceof TypeError) { setOnline(false); throw new Error('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'); } throw e; }
    finally { clearTimeout(t); }
  };
  CS.detectServer = async function () {
    if (!location.protocol.startsWith('http')) return false;
    try { const ctl = new AbortController(); setTimeout(() => ctl.abort(), 4000); const r = await fetch('api.php?a=ping', { method: 'POST', signal: ctl.signal, cache: 'no-store' }); const j = await r.json(); return j && j.app === 'cepstok' ? j : false; }
    catch (e) { return CS.ls.get(SESSION, null) ? { offline: true } : false; }
  };

  /* ---------- Kayıt yardımcıları ---------- */
  const COLLS = () => Object.keys(CS.db).filter((k) => !META.includes(k) && k !== 'v' && Array.isArray(CS.db[k]));
  function strip(coll, o) {
    if (coll !== 'products') return o;
    const c = { ...o }; delete c.stock;
    const fx = c.cur && c.cur !== '₺';
    if (fx) delete c.buy;
    if (fx || c.autoPrice) { delete c.sell; delete c.prices; }
    return c;
  }
  const key = (c, i) => c + '\u0001' + i;
  function buildSnap() { snap = new Map(); COLLS().forEach((c) => CS.db[c].forEach((o) => o && o.id != null && snap.set(key(c, o.id), JSON.stringify(strip(c, o))))); META.forEach((m) => CS.db[m] !== undefined && snap.set(key('_meta', m), JSON.stringify(CS.db[m]))); }
  function diff() {
    const seen = new Set(); let n = 0;
    const put = (c, i, d) => { const k = key(c, i); seen.add(k); const j = JSON.stringify(d); if (snap.get(k) !== j) { snap.set(k, j); queue.set(k, { c, i, d: JSON.parse(j), x: 0 }); n++; } };
    COLLS().forEach((c) => CS.db[c].forEach((o) => { if (o && o.id != null) put(c, String(o.id), strip(c, o)); }));
    META.forEach((m) => CS.db[m] !== undefined && put('_meta', m, CS.db[m]));
    for (const k of [...snap.keys()]) if (!seen.has(k)) { const [c, i] = k.split('\u0001'); snap.delete(k); queue.set(k, { c, i, d: null, x: 1 }); n++; }
    if (n) saveQueue();
    return n;
  }
  const saveQueue = () => CS.ls.set(K('queue'), [...queue.values()]);
  function loadQueue() { queue = new Map(); (CS.ls.get(K('queue'), []) || []).forEach((q) => queue.set(key(q.c, q.i), q)); }

  /* ---------- Eşitleme ---------- */
  async function push() {
    if (pushing || !queue.size || !CS.server) return; pushing = true; updStatus();
    try {
      while (queue.size) {
        const batch = [...queue.values()].slice(0, 1500);
        const r = await CS.api('push', { changes: batch });
        batch.forEach((b) => { const k = key(b.c, b.i); if (queue.get(k) === b) queue.delete(k); });
        saveQueue(); if (r.denied) CS.toast(r.denied + ' kayıt yetkiniz olmadığı için sunucuya yazılmadı.', 'warn');
      }
      lastErr = '';
    } catch (e) { lastErr = e.message; }
    finally { pushing = false; updStatus(); }
  }
  async function pull(full) {
    if (!CS.server) return 0; let applied = 0;
    try {
      let more = true;
      while (more) {
        const r = await CS.api('pull', { since: full ? 0 : seq });
        applied += apply(r.rows); seq = r.seq; more = r.more; full = false;
        if (r.company?.name && CS.server.company.name !== r.company.name) { CS.server.company.name = r.company.name; CS.ls.set(SESSION, CS.server); }
      }
      CS.ls.set(K('seq'), seq); lastErr = '';
    } catch (e) { lastErr = e.message; }
    updStatus(); return applied;
  }
  function apply(rows) {
    if (!rows.length) return 0; let n = 0; const idx = {};
    const ix = (c) => idx[c] || (idx[c] = new Map((CS.db[c] = CS.db[c] || []).map((o, i) => [String(o.id), i])));
    rows.forEach((r) => {
      const k = key(r.c, r.i); if (queue.has(k)) return; // yerelde bekleyen değişiklik önceliklidir
      if (r.c === '_meta') { if (!r.x) { CS.db[r.i] = r.d; snap.set(k, JSON.stringify(r.d)); n++; } return; }
      const m = ix(r.c); const at = m.get(String(r.i));
      if (r.x) { if (at != null) { CS.db[r.c].splice(at, 1); delete idx[r.c]; n++; } snap.delete(k); return; }
      const j = JSON.stringify(r.d); if (snap.get(k) === j && at != null) return;
      if (r.c === 'products' && at != null) r.d.stock = CS.db.products[at].stock;
      if (at != null) CS.db[r.c][at] = r.d; else { CS.db[r.c].push(r.d); m.set(String(r.i), CS.db[r.c].length - 1); }
      snap.set(k, j); n++;
    });
    if (n) {
      CS.db.log && CS.db.log.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      CS.recalcStock(); CS.applyAllPricing && CS.applyAllPricing();
      const u = CS.byId('users', CS.user?.id); if (u) CS.user = u;
      CS.ls.set('cepstok:db:' + CS.companyId, CS.db);
    }
    return n;
  }
  CS.syncNow = async function (quiet) {
    if (!CS.server) return; diff(); await push(); const n = await pull();
    if (n && !quiet) refreshView();
    return n;
  };
  function refreshView() {
    if (!document.getElementById('main') || !CS.user) return;
    CS.refreshBadges && CS.refreshBadges();
    const ae = document.activeElement; const busy = document.querySelector('.modal-wrap') || (ae && ae.matches && ae.matches('input,select,textarea'));
    const route = (location.hash.replace('#', '') || 'dashboard').split('/')[0];
    if (!busy && !['pos'].includes(route) && !/\/(new|edit)\//.test(location.hash)) CS.route();
  }
  function schedule() { clearTimeout(pullTimer); pullTimer = setTimeout(async () => { await CS.syncNow(); schedule(); }, document.hidden ? 60000 : 15000); }
  let pushDeb; CS.onSave = function () { if (!CS.server) return; clearTimeout(pushDeb); pushDeb = setTimeout(() => { diff(); push(); }, 700); };

  /* ---------- Durum göstergesi ---------- */
  function setOnline(v) { if (online !== v) { online = v; updStatus(); if (v) push(); } }
  function updStatus() {
    const el = $('#syncst'); if (!el) return;
    const q = queue.size;
    el.className = 'sync ' + (!online ? 'off' : q || pushing ? 'busy' : 'on');
    el.textContent = !online ? `Çevrimdışı${q ? ' · ' + q + ' bekliyor' : ''}` : pushing ? 'Kaydediliyor…' : q ? q + ' değişiklik bekliyor' : 'Eşitlendi';
    el.title = lastErr || (online ? 'Veriler sunucudaki ortak veritabanında' : 'İnternet gelince değişiklikler otomatik gönderilir');
  }
  CS.syncStatus = updStatus;
  window.addEventListener('online', () => { setOnline(true); CS.syncNow(); });
  window.addEventListener('offline', () => setOnline(false));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && CS.server) CS.syncNow(); });

  /* ---------- Firma veritabanını kur ---------- */
  function buildDb(name) { const d = CS.defaultDB(name); Object.keys(d).forEach((k) => { if (!META.includes(k) && Array.isArray(d[k])) d[k] = []; }); return d; }
  async function openCompany(sess, user) {
    CS.server = sess; CS.ls.set(SESSION, sess); CS.companyId = 'srv_' + sess.company.id;
    const cached = CS.ls.get('cepstok:db:' + CS.companyId, null);
    if (cached) { const def = CS.defaultDB(sess.company.name); for (const k in def) if (cached[k] === undefined) cached[k] = def[k]; for (const k in def.settings) if (cached.settings[k] === undefined) cached.settings[k] = def.settings[k]; CS.db = cached; seq = CS.ls.get(K('seq'), 0) || 0; }
    else { CS.db = buildDb(sess.company.name); seq = 0; }
    CS.license = CS.ls.get('cepstok:lic:' + sess.company.id, null);
    loadQueue(); CS.migrateRoles(); CS.recalcStock(); buildSnap();
    // kuyruktaki bekleyenler snapshot'ta "gönderilmiş" sayılmasın
    queue.forEach((q, k) => { if (q.x) snap.delete(k); else snap.set(k, JSON.stringify(q.d)); });
    if (!cached) { const n = await pull(true); if (!n && lastErr) throw new Error(lastErr); }
    else pull().then((n) => n && refreshView());
    if (user) { const i = CS.db.users.findIndex((u) => u.id === user.id); if (i >= 0) CS.db.users[i] = { ...CS.db.users[i], ...user }; else CS.db.users.push(user); snap.set(key('users', user.id), JSON.stringify(CS.db.users.find((u) => u.id === user.id))); }
    CS.user = CS.byId('users', sess.userId);
    if (!CS.user) throw new Error('Kullanıcı kaydı bulunamadı.');
    CS.branchId = sessionStorage.getItem('cepstok:branch') || CS.user.branchId || CS.db.branches[0]?.id;
    CS.applyAllPricing && CS.applyAllPricing(); CS.loadRates && CS.loadRates();
    schedule();
  }
  CS.serverResume = async function () { const s = CS.ls.get(SESSION, null); if (!s) return false; try { await openCompany(s); return true; } catch (e) { CS.toast(e.message, 'bad', 5000); CS.ls.set(SESSION, null); localStorage.removeItem(SESSION); return false; } };
  CS.serverLogout = async function (expired) {
    if (!expired) { CS.onSave(); diff(); await push(); try { await CS.api('logout'); } catch (e) { } }
    clearTimeout(pullTimer); localStorage.removeItem(SESSION); CS.server = null; CS.user = null; location.hash = ''; CS.serverLoginScreen();
  };

  /* ---------- Giriş / kayıt ekranı ---------- */
  CS.serverLoginScreen = function (info) {
    const app = $('#app'); const last = CS.ls.get('cepstok:lastcode', '');
    app.innerHTML = `<div class="login"><form class="login-card" id="lf" autocomplete="on">
      <a class="logo" href="index.html"><i>₺</i><span>CepStok</span></a>
      <p class="muted">Firmanızın verileri sunucudaki ortak veritabanında tutulur; tüm cihazlarınız aynı stoğu görür.</p>
      <label class="fld full"><span>Firma kodu</span><input id="lc" value="${esc(last)}" required autocomplete="organization" autocapitalize="off"></label>
      <label class="fld full"><span>Kullanıcı adı</span><input id="lu" required autocomplete="username" autocapitalize="off"></label>
      <label class="fld full"><span>Şifre</span><input id="lp" type="password" required autocomplete="current-password"></label>
      <button class="btn primary" type="submit">Giriş yap</button>
      ${info?.register !== false ? '<button class="btn tag" type="button" id="lr">Yeni firma oluştur · 30 gün ücretsiz</button>' : ''}<a class="muted" style="text-align:center;font-size:13px" href="https://wa.me/905344914530" target="_blank" rel="noopener">Yardım ve satın alma: WhatsApp +90 534 491 45 30</a>
    </form></div>`;
    setTimeout(() => (last ? $('#lu') : $('#lc')).focus(), 30);
    const lr = $('#lr'); if (lr) lr.onclick = registerScreen;
    $('#lf').onsubmit = async (e) => {
      e.preventDefault(); const b = $('#lf button[type=submit]'); b.disabled = true; b.textContent = 'Giriş yapılıyor…';
      try {
        const r = await CS.api('login', { code: $('#lc').value, username: $('#lu').value, password: $('#lp').value });
        CS.ls.set('cepstok:lastcode', r.company.code);
        b.textContent = 'Veriler yükleniyor…';
        await openCompany({ token: r.token, company: r.company, userId: r.user.id }, r.user);
        CS.log('Oturum açıldı'); CS.save(); CS.shell();
      } catch (err) { CS.toast(err.message, 'bad', 5000); b.disabled = false; b.textContent = 'Giriş yap'; }
    };
  };
  function registerScreen() {
    const app = $('#app');
    app.innerHTML = `<div class="login"><form class="login-card" id="rf">
      <a class="logo" href="index.html"><i>₺</i><span>CepStok</span></a><h2 style="margin:0">Yeni firma</h2>
      <label class="fld full"><span>Firma adı</span><input id="rn" required></label>
      <label class="fld full"><span>Firma kodu</span><input id="rc" required autocapitalize="off"><small>Giriş yaparken kullanılır. Harf, rakam ve tire.</small></label>
      <p class="alert info" id="trialInfo" style="margin:0">İlk 30 gün ücretsiz; kredi kartı istenmez.</p>
      <label class="fld full"><span>Adınız soyadınız</span><input id="ra" required></label>
      <label class="fld full"><span>Cep telefonu</span><input id="rph" required inputmode="tel" placeholder="05xx xxx xx xx"><small>Süre bitiminde size ulaşabilmemiz için</small></label>
      <label class="fld full"><span>Kullanıcı adı</span><input id="ru" required autocapitalize="off" value="admin"></label>
      <label class="fld full"><span>Şifre (en az 4 karakter)</span><input id="rp" type="password" required minlength="4"></label>
      <label class="chk full" style="padding:0"><input type="checkbox" id="rd"> Örnek verilerle başlat (deneme için)</label>
      <label class="fld full" id="rkw" hidden><span>Kayıt anahtarı</span><input id="rk"></label>
      <button class="btn primary" type="submit">Firmayı oluştur</button><button class="btn ghost" type="button" id="rb">Girişe dön</button>
    </form></div>`;
    const slug = (s) => CS.trLower(s).replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let touched = false; $('#rc').oninput = () => (touched = true); $('#rn').oninput = () => { if (!touched) $('#rc').value = slug($('#rn').value); };
    $('#rb').onclick = () => CS.serverLoginScreen();
    CS.api('site').then((S) => { const ti = $('#trialInfo'); if (ti) ti.textContent = S.trialDays ? `İlk ${S.trialDays} gün ücretsiz; kredi kartı istenmez.` : 'Kayıt ücretsizdir.'; }).catch(() => { });
    $('#rf').onsubmit = async (e) => {
      e.preventDefault(); const b = $('#rf button[type=submit]'); b.disabled = true; b.textContent = 'Oluşturuluyor…';
      try {
        const name = $('#rn').value.trim();
        const r = await CS.api('register', { companyName: name, code: $('#rc').value, adminName: $('#ra').value, phone: $('#rph').value, username: $('#ru').value, password: $('#rp').value, key: $('#rk').value });
        CS.ls.set('cepstok:lastcode', r.company.code);
        CS.server = { token: r.token, company: r.company, userId: r.user.id }; CS.ls.set(SESSION, CS.server); CS.companyId = 'srv_' + r.company.id;
        // başlangıç verisi
        const base = $('#rd').checked && CS.demoDB ? CS.demoDB(name) : CS.defaultDB(name);
        base.company.name = name; base.users = [{ ...r.user, branchId: base.branches[0].id, warehouseId: base.warehouses[0].id }];
        base.log = [{ id: CS.uid(), at: CS.now(), user: r.user.name, action: 'Firma oluşturuldu', detail: name }];
        CS.db = base; CS.ls.set('cepstok:db:' + CS.companyId, base); seq = 0; queue = new Map(); snap = new Map();
        snap.set(key('users', r.user.id), JSON.stringify(base.users[0])); // yönetici sunucuda zaten var
        CS.recalcStock(); diff(); b.textContent = 'Veriler sunucuya yükleniyor…'; await push();
        await openCompany(CS.server);
        CS.toast(`Firma oluşturuldu. Firma kodunuz: ${r.company.code}`, 'ok', 7000); CS.shell();
      } catch (err) { if (err.status === 403) $('#rkw').hidden = false; CS.toast(err.message, 'bad', 6000); b.disabled = false; b.textContent = 'Firmayı oluştur'; }
    };
  }

  /* ---------- Ortak barkod havuzu ---------- */
  const poolCache = new Map();
  CS.poolLookup = async function (code) {
    code = String(code || '').trim(); if (!CS.server || code.length < 6) return null;
    if (poolCache.has(code)) return poolCache.get(code);
    try { const r = await CS.api('barcode', { code }, 6000); const v = r.found ? r : null; poolCache.set(code, v); return v; } catch (e) { return null; }
  };
})();
