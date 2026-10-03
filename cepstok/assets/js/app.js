/* CepStok — uygulama kabuğu: giriş, menü, üst çubuk, genel arama, bildirimler */
(function () {
  const { $, $$, esc, icon } = CS;

  const NAV = [
    ['Genel', [['dashboard', 'Özet', 'home'], ['pos', 'Hızlı satış', 'cart']]],
    ['Stok', [['products', 'Ürünler', 'box'], ['stock', 'Stok ve depo', 'layers'], ['production', 'Üretim', 'factory']]],
    ['Alış ve satış', [['docs', 'Faturalar ve belgeler', 'file'], ['orders', 'Siparişler ve teklifler', 'clip'], ['contacts', 'Cari hesaplar', 'users']]],
    ['Para', [['finance', 'Kasa ve banka', 'wallet'], ['cheques', 'Çek, senet, kredi', 'cheque'], ['expenses', 'Gelir ve gider', 'trend']]],
    ['Yönetim', [['staff', 'Personel', 'id'], ['reports', 'Raporlar', 'chart'], ['import', 'Excel’den veri al', 'upload'], ['integrations', 'Entegrasyonlar', 'plug'], ['settings', 'Ayarlar', 'gear']]]
  ];

  CS.setTheme = (t) => { document.documentElement.dataset.theme = t; CS.ls.set('cepstok:theme', t); };

  CS.start = async function () {
    if (location.protocol.startsWith('http') && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
    const srv = CS.detectServer ? await CS.detectServer() : false;
    if (srv) { // sunucu modu: veriler merkezi veritabanında
      $('#app').innerHTML = '<div class="login"><p style="color:#fff">Yükleniyor…</p></div>';
      if (await CS.serverResume()) shell(); else CS.serverLoginScreen(srv);
      return;
    }
    CS.loadCompany();
    const uid = sessionStorage.getItem('cepstok:user:' + CS.companyId);
    const u = uid && CS.byId('users', uid);
    if (u && u.active !== false) { CS.user = u; CS.branchId = sessionStorage.getItem('cepstok:branch') || u.branchId || CS.db.branches[0]?.id; shell(); }
    else login();
  };

  function login() {
    const app = $('#app'); const users = CS.db.users.filter((u) => u.active !== false); const comps = CS.companies();
    app.innerHTML = `<div class="login"><form class="login-card" autocomplete="off">
      <a class="logo" href="index.html"><i>₺</i><span>CepStok</span></a>
      <p class="muted">Devam etmek için kullanıcınızı seçip şifrenizi girin.</p>
      ${comps.length > 1 ? `<label class="fld full"><span>Firma</span><select id="lc">${comps.map((c) => `<option value="${c.id}" ${c.id === CS.companyId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
      <label class="fld full"><span>Kullanıcı</span><select id="lu">${users.map((u) => `<option value="${u.id}">${esc(u.name)} (${esc(u.username)})</option>`).join('')}</select></label>
      <label class="fld full"><span>Şifre / PIN</span><input id="lp" type="password" inputmode="numeric" autofocus></label>
      <button class="btn primary" type="submit">Giriş yap</button>
      <p class="muted" style="font-size:12.5px">İlk kurulum: kullanıcı <b>admin</b>, şifre <b>1234</b>. Ayarlar &gt; Kullanıcılar bölümünden değiştirin.</p>
    </form></div>`;
    const lc = $('#lc'); if (lc) lc.onchange = () => { CS.loadCompany(lc.value); login(); };
    $('form', app).onsubmit = (e) => {
      e.preventDefault(); const u = CS.byId('users', $('#lu').value);
      if (!u || String(u.pin) !== $('#lp').value) { CS.toast('Şifre hatalı.', 'bad'); $('#lp').select(); return; }
      CS.user = u; CS.branchId = u.branchId || CS.db.branches[0]?.id; sessionStorage.setItem('cepstok:user:' + CS.companyId, u.id);
      CS.log('Oturum açıldı'); CS.save(); shell();
    };
  }
  CS.logout = () => { CS.log('Oturum kapatıldı'); CS.save(true); if (CS.server) return CS.serverLogout(); sessionStorage.removeItem('cepstok:user:' + CS.companyId); CS.user = null; location.hash = ''; login(); };

  CS.shell = shell;
  function shell() {
    const app = $('#app'); const comps = CS.companies();
    app.innerHTML = `<div class="shell">
      <header class="top">
        <button class="icon-btn mob-only" id="burger" aria-label="Menüyü aç">${icon('menu')}</button>
        <a class="logo" href="#dashboard"><i>₺</i><span>CepStok</span></a>
        <div class="gsearch">${icon('search', 16)}<input id="gs" type="search" placeholder="Ürün, cari, belge ara (Ctrl+K)" aria-label="Genel arama" autocomplete="off"><div class="gs-res" id="gsr"></div></div>
        <div class="top-acts">
          ${CS.server ? '<span id="syncst" class="sync on hide-m">Eşitlendi</span>' : ''}<button class="ratechip hide-m" id="ratechip" title="Döviz kurları">Kur</button>
          ${!CS.server && comps.length > 1 ? `<select id="tc" class="hide-m" aria-label="Firma">${comps.map((c) => `<option value="${c.id}" ${c.id === CS.companyId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : ''}
          ${CS.db.branches.length > 1 ? `<select id="tb" class="hide-m" aria-label="Şube"><option value="">Tüm şubeler</option>${CS.db.branches.map((b) => `<option value="${b.id}" ${b.id === CS.branchId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : ''}
          ${CS.can('pos') ? `<a class="btn quick hide-m" href="#pos">${icon('cart', 16)}<span>Satış yap</span></a>` : ''}
          <button class="icon-btn" id="tn" aria-label="Bildirimler">${icon('bell')}</button><span id="tnb"></span>
          <button class="icon-btn" id="tt" aria-label="Tema değiştir">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
          <button class="icon-btn" id="to" aria-label="Çıkış yap" title="${esc(CS.user.name)} — çıkış">${icon('out')}</button>
        </div>
      </header>
      <aside class="side"><nav class="nav" aria-label="Ana menü">${NAV.map(([g, items]) => { const vis = items.filter(([k]) => (k === 'import' ? ['products', 'contacts', 'stock', 'finance', 'docs'].some((m) => CS.can(m, 'e')) : CS.can(CS.modules[k]?.perm || k))); return vis.length ? `<h5>${esc(g)}</h5>` + vis.map(([k, l, ic]) => `<a href="#${k}" data-k="${k}">${icon(ic)}<span>${esc(l)}</span>${k === 'products' ? '<span class="cnt" id="critCnt" hidden></span>' : ''}</a>`).join('') : ''; }).join('')}</nav>
        <div class="side-foot">${esc(CS.db.company.name)}${CS.server ? ' · kod: <b>' + esc(CS.server.company.code) + '</b>' : ''}<br>${esc(CS.user.name)} · ${esc(CS.role()?.name || '')}</div></aside>
      <main id="main"><div id="licbar"></div><div id="view"></div></main>
    </div>`;
    $('#burger').onclick = () => document.body.classList.toggle('nav-open');
    $('#to').onclick = CS.logout;
    $('#tt').onclick = () => { CS.setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); $('#tt').innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'); };
    const tc = $('#tc'); if (tc) tc.onchange = () => { CS.save(true); CS.loadCompany(tc.value); CS.user = null; login(); };
    const tb = $('#tb'); if (tb) tb.onchange = () => { CS.branchId = tb.value || null; sessionStorage.setItem('cepstok:branch', tb.value); CS.route(); };
    $('#tn').onclick = showNotifications; $('#ratechip').onclick = () => CS.ratesDialog(); CS.rateChip(); CS.syncStatus && CS.syncStatus(); if (!CS.server) CS.loadRates();
    globalSearch();
    window.onhashchange = CS.route;
    CS.route(); CS.refreshBadges(); CS.renderLicense();
    backupReminder(); processInbox();
    window.addEventListener('storage', (e) => { if (e.key === 'cepstok:inbox:' + CS.companyId) processInbox(); });
  }
  /** Bu cihazdaki B2B katalogdan gelen siparişleri işler */
  function processInbox() {
    const key = 'cepstok:inbox:' + CS.companyId; let box; try { box = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { box = []; }
    if (!box.length || !CS.createCatalogOrder) return; localStorage.removeItem(key);
    const go = CS.go; CS.go = () => { }; box.forEach((o) => CS.createCatalogOrder(o)); CS.go = go;
    CS.toast(box.length + ' yeni B2B katalog siparişi geldi.', 'warn', 5000); CS.refreshBadges();
  }

  CS.refreshBadges = function () {
    const crit = CS.db.products.filter(CS.isCritical).length; const c = $('#critCnt'); if (c) { c.hidden = !crit; c.textContent = crit; }
    const n = notifications().length; const b = $('#tnb'); if (b) b.innerHTML = n ? `<span class="badge">${n}</span>` : '';
  };

  function notifications() {
    const out = []; const t = CS.today(); const soon = CS.addDays(t, 7);
    CS.db.products.filter(CS.isCritical).slice(0, 30).forEach((p) => out.push({ k: 'warn', t: `Kritik stok: ${CS.productName(p)} (${CS.qty(CS.stockOf(p))} ${p.unit || ''})`, h: 'products/' + p.id }));
    CS.db.cheques.filter((c) => ['portfoy', 'verildi', 'tahsilde'].includes(c.status) && c.due <= soon).forEach((c) => out.push({ k: c.due < t ? 'bad' : 'warn', t: `${c.kind === 'cek' ? 'Çek' : 'Senet'} vadesi ${CS.date(c.due)}: ${CS.money(c.amount)} — ${CS.contactName(c.cid)}`, h: 'cheques' }));
    CS.db.loans.forEach((l) => (l.inst || []).filter((i) => !i.paid && i.due <= soon).forEach((i) => out.push({ k: i.due < t ? 'bad' : 'warn', t: `Kredi taksiti ${CS.date(i.due)}: ${CS.money(i.amount)} — ${l.name}`, h: 'cheques/loans' })));
    CS.db.docs.filter((d) => ['satis', 'alis'].includes(d.type) && d.status !== 'iptal' && d.due && d.due < t && d.cid && CS.docPaid(d) + 0.01 < d.totalTry).slice(0, 20).forEach((d) => out.push({ k: 'bad', t: `Vadesi geçmiş ${d.type === 'satis' ? 'alacak' : 'borç'}: ${d.no} — ${CS.contactName(d.cid)} (${CS.date(d.due)})`, h: 'docs/view/' + d.id }));
    CS.db.docs.filter((d) => d.type === 'siparis' && ['yeni', 'hazirlaniyor'].includes(d.status)).forEach((d) => out.push({ k: 'info', t: `Bekleyen sipariş: ${d.no} — ${CS.contactName(d.cid) || d.channel || ''}`, h: 'orders' }));
    CS.db.notes.filter((n) => !n.done && n.date && n.date <= t).forEach((n) => out.push({ k: 'info', t: 'Hatırlatma: ' + n.text, h: 'dashboard' }));
    return out;
  }
  CS.notifications = notifications;
  function showNotifications() {
    const n = notifications();
    CS.modal({ title: 'Bildirimler', body: n.length ? `<div class="list">${n.map((x) => `<div><span><span class="pill ${x.k}">${x.k === 'bad' ? 'Gecikmiş' : x.k === 'warn' ? 'Uyarı' : 'Bilgi'}</span> ${esc(x.t)}</span><a href="#${x.h}" onclick="this.closest('.modal-wrap').remove()">Aç</a></div>`).join('')}</div>` : '<p class="empty">Bekleyen bildirim yok.</p>' });
  }

  function globalSearch() {
    const inp = $('#gs'), res = $('#gsr'); let sel = -1;
    const run = () => {
      const q = inp.value.trim(); if (q.length < 2) { res.classList.remove('open'); return; }
      const ps = CS.db.products.filter((p) => CS.match(p.name + ' ' + p.barcode + ' ' + p.code, q)).slice(0, 8);
      const cs = CS.db.contacts.filter((c) => CS.match(c.name + ' ' + c.phone + ' ' + c.taxNo + ' ' + c.code, q)).slice(0, 6);
      const ds = CS.db.docs.filter((d) => CS.match(d.no + ' ' + (d.eno || '') + ' ' + CS.contactName(d.cid), q)).slice(-6).reverse();
      res.innerHTML = (ps.length ? '<h4>Ürünler</h4>' + ps.map((p) => `<a href="#products/${p.id}"><span>${esc(CS.productName(p))}</span><span class="muted">${CS.money(p.sell)} · ${CS.qty(CS.stockOf(p))}</span></a>`).join('') : '') +
        (cs.length ? '<h4>Cariler</h4>' + cs.map((c) => `<a href="#contacts/${c.id}"><span>${esc(c.name)}</span><span class="muted">${CS.balanceText(CS.balance(c.id))}</span></a>`).join('') : '') +
        (ds.length ? '<h4>Belgeler</h4>' + ds.map((d) => `<a href="#docs/view/${d.id}"><span>${esc(d.no)} · ${esc(CS.DOC_TYPES[d.type].short)}</span><span class="muted">${CS.money(d.total, d.currency)}</span></a>`).join('') : '') || '<p class="empty">Sonuç yok.</p>';
      res.classList.add('open'); sel = -1;
    };
    inp.addEventListener('input', CS.debounce(run, 120));
    inp.addEventListener('keydown', (e) => {
      const links = $$('a', res);
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, links.length - 1); } else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); } else if (e.key === 'Enter') { (links[sel] || links[0])?.click(); inp.blur(); return; } else if (e.key === 'Escape') { res.classList.remove('open'); return; } else return;
      e.preventDefault(); links.forEach((a, i) => a.classList.toggle('sel', i === sel));
    });
    res.addEventListener('click', () => { res.classList.remove('open'); inp.value = ''; });
    document.addEventListener('click', (e) => { if (!e.target.closest('.gsearch')) res.classList.remove('open'); });
    document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inp.focus(); } });
  }

  function backupReminder() {
    const s = CS.db.settings; if (!CS.can('settings', 'e') || !s.autoBackupDays) return;
    if (!s.lastBackup) { s.lastBackup = CS.today(); CS.save(); return; }
    if (CS.daysBetween(s.lastBackup, CS.today()) >= s.autoBackupDays) setTimeout(() => CS.toast('Son yedeğinizin üzerinden ' + CS.daysBetween(s.lastBackup, CS.today()) + ' gün geçti. Ayarlar > Yedekleme bölümünden yedek alın.', 'warn', 6000), 1500);
  }

  /* ---------- Kullanım süresi (abonelik) ---------- */
  CS.waNumber = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '9' + d; else if (d.length === 10) d = '90' + d; return d; };
  CS.renewUrl = function () {
    const L = CS.license || {}; const wa = CS.waNumber(L.contact?.whatsapp || '+905344914530');
    const msg = `Merhaba, CepStok kullanım süremi uzatmak istiyorum.\nFirma: ${CS.db?.company?.name || ''}\nFirma kodu: ${CS.server?.company?.code || ''}\nPaket: ${L.planName || ''}`;
    return `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
  };
  CS.renderLicense = function () {
    const bar = $('#licbar'); if (!bar) return; const L = CS.license;
    document.querySelector('.blocker')?.remove();
    if (!CS.server || !L) { bar.innerHTML = ''; return; }
    if (L.expired || L.suspended) {
      bar.innerHTML = '';
      const b = document.createElement('div'); b.className = 'blocker';
      b.innerHTML = `<div class="blocker-card"><span class="logo"><i>₺</i><span>CepStok</span></span><h2>${L.suspended ? 'Hesabınız askıya alındı' : L.trial ? 'Ücretsiz kullanım süreniz doldu' : (L.planName && L.planName !== 'Sınırsız' ? L.planName + ' paketinizin' : 'Kullanım') + ' süresi doldu'}</h2><p>${esc(L.contact?.note || 'Kullanmaya devam etmek için WhatsApp’tan bize yazın.')}</p>${L.expires ? `<p class="muted">Bitiş tarihi: ${CS.date(L.expires.slice(0, 10))}</p>` : ''}<a class="btn wa" href="${CS.renewUrl()}" target="_blank" rel="noopener">${icon('msg')} WhatsApp’tan yazın: ${esc(L.contact?.whatsapp || '+90 534 491 45 30')}</a><p class="muted" style="font-size:13px">Süreniz uzatıldığında bu ekran kendiliğinden kapanır. Verileriniz silinmez.</p><div class="row" style="justify-content:center"><button class="btn sm" data-x="check">Süremi kontrol et</button><button class="btn sm" data-x="backup">Verilerimi indir</button><button class="btn sm" data-x="out">Çıkış</button></div></div>`;
      document.body.appendChild(b);
      b.addEventListener('click', async (e) => { const x = e.target.closest('[data-x]')?.dataset.x; if (x === 'out') CS.serverLogout(true); if (x === 'backup') CS.download(`cepstok-yedek-${CS.today()}.json`, JSON.stringify({ app: 'cepstok', v: 1, at: CS.now(), company: CS.db.company.name, db: CS.db }), 'application/json'); if (x === 'check') { try { const r = await CS.api('license'); CS.setLicense(r.license); if (!r.license.expired && !r.license.suspended) { CS.toast('Süreniz uzatılmış, devam edebilirsiniz.'); CS.syncNow(); } else CS.toast('Süreniz henüz uzatılmamış.', 'warn'); } catch (err) { CS.toast(err.message, 'bad'); } } });
      // süre dolduğunda WhatsApp'a yönlendir (bir kez otomatik)
      const k = 'cepstok:waredirect:' + (CS.server?.company?.id || '') + ':' + (L.expires || '');
      if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); setTimeout(() => { const w = window.open(CS.renewUrl(), '_blank'); if (!w) CS.toast('WhatsApp’a geçmek için yeşil düğmeye basın.', 'warn', 6000); }, 1500); }
      return;
    }
    if (L.daysLeft != null && L.daysLeft <= 7) bar.innerHTML = `<div class="licbar ${L.daysLeft <= 3 ? 'bad' : ''}"><span>${L.planName ? esc(L.planName) + ' · ' : ''}${L.trial ? 'Ücretsiz kullanımın' : 'Kullanım sürenizin'} bitmesine <b>${L.daysLeft} gün</b> kaldı (${CS.date(L.expires.slice(0, 10))}).</span><a class="btn sm wa" href="${CS.renewUrl()}" target="_blank" rel="noopener">${icon('msg', 15)} Süreyi uzat</a></div>`;
    else bar.innerHTML = '';
  };
})();
