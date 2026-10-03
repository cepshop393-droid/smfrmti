/* CepStok — çekirdek: veri katmanı, iş kuralları, arayüz yardımcıları, yönlendirme */
(function () {
  'use strict';
  const CS = (window.CS = {});

  /* ---------------- Genel yardımcılar ---------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  CS.$ = $; CS.$$ = $$;
  CS.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  CS.today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  CS.now = () => new Date().toISOString();
  CS.addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  CS.daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
  CS.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  CS.num = (v) => { if (typeof v === 'number') return isFinite(v) ? v : 0; if (v == null || v === '') return 0; let s = String(v).trim().replace(/\s/g, '').replace(/₺|TL/gi, ''); if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(',', '.'); const n = parseFloat(s); return isFinite(n) ? n : 0; };
  CS.round = (n, d = 2) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;
  const nf2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });
  CS.money = (n, cur) => nf2.format(CS.round(n || 0)) + ' ' + (cur || '₺');
  CS.fmt2 = (n) => nf2.format(CS.round(n || 0));
  CS.qty = (n) => nf.format(CS.round(n || 0, 3));
  CS.date = (iso) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}.${m}.${y}`; };
  CS.dateTime = (iso) => { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); };
  CS.trLower = (s) => String(s ?? '').toLocaleLowerCase('tr-TR');
  CS.match = (hay, q) => CS.trLower(hay).includes(CS.trLower(q));
  CS.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  CS.sum = (arr, f) => arr.reduce((s, x) => s + (typeof f === 'function' ? f(x) : x[f]) * 1, 0);
  CS.groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});
  CS.monthKey = (iso) => iso.slice(0, 7);
  CS.monthName = (key) => { const [y, m] = key.split('-'); return ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][+m - 1] + ' ' + y.slice(2); };
  CS.download = (name, content, type = 'text/plain;charset=utf-8') => { const blob = content instanceof Blob ? content : new Blob([content], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };

  /* ---------------- Veri katmanı (çoklu firma) ---------------- */
  const KEY_COMPANIES = 'cepstok:companies';
  const KEY_ACTIVE = 'cepstok:active';
  const KEY_DB = (id) => 'cepstok:db:' + id;
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { CS.toast('Kayıt alanı doldu. Ayarlar > Yedekleme bölümünden yedek alıp eski kayıtları temizleyin.', 'bad'); return false; } }
  };
  CS.ls = ls;

  const ALL_MODULES = ['cost', 'dashboard', 'pos', 'products', 'stock', 'production', 'contacts', 'docs', 'orders', 'finance', 'cheques', 'expenses', 'staff', 'reports', 'settings', 'integrations'];
  CS.ALL_MODULES = ALL_MODULES;
  CS.MODULE_LABELS = { cost: 'Alış fiyatı, maliyet ve kâr görme', dashboard: 'Özet', pos: 'Hızlı satış', products: 'Ürünler', stock: 'Stok ve depo', production: 'Üretim', contacts: 'Cari hesaplar', docs: 'Faturalar ve belgeler', orders: 'Siparişler ve teklifler', finance: 'Kasa ve banka', cheques: 'Çek, senet, kredi', expenses: 'Gelir ve gider', staff: 'Personel', reports: 'Raporlar', settings: 'Ayarlar', integrations: 'Entegrasyonlar' };

  function fullPerms(v = true, e = true, d = true) { const p = {}; ALL_MODULES.forEach((m) => (p[m] = { v, e, d })); return p; }

  CS.defaultDB = function (name) {
    const br = 'br1', wh1 = 'wh1';
    const db = {
      v: 1,
      company: { name: name || 'Firmam', title: '', taxOffice: '', taxNo: '', mersis: '', phone: '', email: '', address: '', city: '', iban: '', logo: '', web: '' },
      settings: {
        currency: '₺', defaultKdv: 20, priceIncludesKdv: true, negativeStock: true, receiptWidth: 80, receiptFooter: 'Bizi tercih ettiğiniz için teşekkürler.',
        priceLists: ['Perakende', 'Bayi 1', 'Bayi 2', 'Bayi 3'], lastPurchaseUpdatesCost: true, costMethod: 'ortalama', rateMode: 'auto', rateSide: 'satis', rateManual: { USD: 0, EUR: 0, GBP: 0 }, priceRound: '', showBuyOnCheck: true, theme: 'light', posQuickCategory: '', criticalNotify: true,
        docNo: {}, smsTemplate: 'Sayın {ad}, {firma} nezdindeki güncel bakiyeniz {bakiye}. Ödeme için IBAN: {iban}', labelSize: '50x30', autoBackupDays: 7, lastBackup: ''
      },
      roles: [
        { id: 'r_admin', name: 'Yönetici', perms: fullPerms() },
        { id: 'r_cashier', name: 'Kasiyer', perms: Object.assign(fullPerms(false, false, false), { dashboard: { v: true, e: false, d: false }, pos: { v: true, e: true, d: false }, products: { v: true, e: false, d: false }, contacts: { v: true, e: true, d: false } }) },
        { id: 'r_field', name: 'Saha satış', perms: Object.assign(fullPerms(false, false, false), { dashboard: { v: true, e: false, d: false }, pos: { v: true, e: true, d: false }, products: { v: true, e: false, d: false }, contacts: { v: true, e: true, d: false }, orders: { v: true, e: true, d: false }, docs: { v: true, e: true, d: false } }) },
        { id: 'r_acc', name: 'Muhasebe (salt okunur)', perms: fullPerms(true, false, false) },
        { id: 'r_staff', name: 'Personel (maliyet görmez)', perms: Object.assign(fullPerms(false, false, false), { dashboard: { v: true, e: false, d: false }, pos: { v: true, e: true, d: false }, products: { v: true, e: true, d: false }, stock: { v: true, e: true, d: false }, contacts: { v: true, e: true, d: false }, orders: { v: true, e: true, d: false }, docs: { v: true, e: true, d: false } }) }
      ],
      users: [{ id: 'u_admin', name: 'Yönetici', username: 'admin', pin: '1234', roleId: 'r_admin', branchId: br, warehouseId: wh1, active: true, commission: 0 }],
      branches: [{ id: br, name: 'Merkez şube', address: '', phone: '', taxNo: '' }],
      warehouses: [{ id: wh1, name: 'Ana depo', type: 'sube', branchId: br, ref: '' }],
      categories: [], brands: [], units: ['Adet', 'Kg', 'Gr', 'Lt', 'Mt', 'Paket', 'Koli', 'Kutu', 'Çift', 'Saat'],
      products: [], moves: [], contacts: [], contactCats: ['Perakende', 'Toptan', 'Kurumsal', 'Tedarikçi'],
      ledger: [], docs: [], accounts: [{ id: 'acc_kasa', type: 'kasa', name: 'Merkez kasa', currency: '₺', opening: 0, branchId: br }],
      accMoves: [], cheques: [], loans: [], assets: [], staff: [], projects: [], productions: [], counts: [], transfers: [],
      expenseCats: ['Kira', 'Elektrik', 'Su', 'Doğalgaz', 'İnternet ve telefon', 'Yakıt', 'Maaş', 'Prim', 'Avans', 'Vergi', 'SGK', 'Kargo', 'Yemek', 'Kırtasiye', 'Bakım onarım', 'Reklam', 'Komisyon', 'Diğer'],
      incomeCats: ['Hizmet geliri', 'Faiz geliri', 'Kira geliri', 'Komisyon geliri', 'Diğer gelir'],
      held: [], sessions: [], log: [], notes: [], smsLog: [], integrations: {}, lostSales: [], recurring: [], leaves: [], visits: [], sources: []
    };
    return db;
  };

  CS.companies = () => ls.get(KEY_COMPANIES, []);
  CS.loadCompany = function (id) {
    let list = CS.companies();
    if (!list.length) { const cid = 'c_' + CS.uid(); list = [{ id: cid, name: 'Firmam' }]; ls.set(KEY_COMPANIES, list); ls.set(KEY_DB(cid), CS.demoDB ? CS.demoDB('Firmam') : CS.defaultDB('Firmam')); }
    id = id || ls.get(KEY_ACTIVE, null) || list[0].id;
    if (!list.find((c) => c.id === id)) id = list[0].id;
    let db = ls.get(KEY_DB(id), null);
    if (!db) { db = CS.defaultDB(list.find((c) => c.id === id).name); }
    // eksik alanları tamamla (sürüm geçişi)
    const def = CS.defaultDB(db.company?.name);
    for (const k in def) if (db[k] === undefined) db[k] = def[k];
    for (const k in def.settings) if (db.settings[k] === undefined) db.settings[k] = def.settings[k];
    CS.db = db; CS.companyId = id; ls.set(KEY_ACTIVE, id);
    CS.migrateRoles(); CS.recalcStock(); CS.applyAllPricing && CS.applyAllPricing();
    return db;
  };
  CS.createCompany = function (name, withDemo) {
    const cid = 'c_' + CS.uid(); const list = CS.companies(); list.push({ id: cid, name }); ls.set(KEY_COMPANIES, list);
    ls.set(KEY_DB(cid), withDemo && CS.demoDB ? CS.demoDB(name) : CS.defaultDB(name)); return cid;
  };
  CS.deleteCompany = function (id) { let list = CS.companies().filter((c) => c.id !== id); ls.set(KEY_COMPANIES, list); localStorage.removeItem(KEY_DB(id)); };
  let saveTimer;
  CS.save = function (now) {
    clearTimeout(saveTimer);
    const run = () => { ls.set(KEY_DB(CS.companyId), CS.db); CS.onSave && CS.onSave(); const list = CS.companies(); const c = list.find((x) => x.id === CS.companyId); if (c && c.name !== CS.db.company.name) { c.name = CS.db.company.name; ls.set(KEY_COMPANIES, list); } };
    if (now) run(); else saveTimer = setTimeout(run, 120);
  };
  window.addEventListener('beforeunload', () => CS.save(true));

  CS.log = function (action, detail) {
    const u = CS.user || {}; CS.db.log.unshift({ id: CS.uid(), at: CS.now(), userId: u.id, user: u.name || '-', action, detail: detail || '' });
    if (CS.db.log.length > 3000) CS.db.log.length = 3000;
  };
  CS.byId = (coll, id) => (CS.db[coll] || []).find((x) => x.id === id);
  CS.nextNo = function (prefix) {
    const s = CS.db.settings.docNo; const y = new Date().getFullYear(); const k = prefix + y; let max = s[k] || 0;
    // diğer cihazlarda kesilen numaralarla çakışmamak için mevcut belgelerdeki en büyük numarayı esas al
    const re = new RegExp('^' + prefix + y + '(\\d+)$');
    [CS.db.docs, CS.db.productions].forEach((arr) => (arr || []).forEach((d) => { const m = re.exec(d.no || ''); if (m) max = Math.max(max, +m[1]); }));
    s[k] = max + 1; return `${prefix}${y}${String(s[k]).padStart(6, '0')}`;
  };
  /** Rol göçü: eski kayıtlarda maliyet yetkisi yoksa ekle */
  CS.migrateRoles = function () { (CS.db.roles || []).forEach((r) => { if (!r.perms.cost) r.perms.cost = { v: r.id === 'r_admin' || r.id === 'r_acc', e: false, d: false }; }); const def = CS.defaultDB().roles.find((r) => r.id === 'r_staff'); if (!CS.db.roles.find((r) => r.id === 'r_staff')) CS.db.roles.push(def); };
  /** Stoğa yeni alış girerken maliyeti günceller (ağırlıklı ortalama ya da son alış) */
  CS.costChanges = [];
  CS.updateCost = function (p, qty, unitTL, info = {}) {
    if (!p || p.service || !(unitTL > 0) || !(qty > 0)) return;
    const st = CS.db.settings; const method = st.costMethod || 'ortalama';
    const fx = p.cur && p.cur !== '₺'; const r = fx ? CS.rate(p.cur) : 1; if (fx && !r) return;
    const unit = fx ? (info.unitFx != null ? info.unitFx : unitTL / r) : unitTL;
    const old = fx ? CS.num(p.buyFx) : CS.num(p.buy);
    const have = Math.max(0, CS.stockOf(p));
    let nw = method === 'ortalama' && have > 0 && old > 0 ? (have * old + qty * unit) / (have + qty) : unit;
    if (method === 'sabit' && old > 0) nw = old;
    nw = CS.round(nw, 4);
    const sellBefore = CS.num(p.sell); const marginBefore = old ? ((CS.netPrice(p) - (fx ? old * r : old)) / (fx ? old * r : old)) * 100 : 0;
    if (Math.abs(nw - old) > 1e-6) { (p.costHist = p.costHist || []).push({ at: CS.now(), doc: info.no || '', old, new: nw, unit, qty, have, method, user: CS.user?.name }); }
    if (fx) p.buyFx = nw; else p.buy = nw;
    CS.applyPricing && CS.applyPricing(p);
    if (Math.abs(nw - old) > 1e-6) CS.costChanges.push({ pid: p.id, old, nw, unit, cur: p.cur || '₺', sellBefore, marginBefore, sellAfter: CS.num(p.sell), auto: !!p.autoPrice });
  };
  CS.canCost = () => CS.can('cost', 'v');

  /* ---------------- Ürün / stok ---------------- */
  CS.product = (id) => CS.byId('products', id);
  CS.productName = (p) => { if (typeof p === 'string') p = CS.product(p); if (!p) return '(silinmiş ürün)'; if (p.attrs && Object.keys(p.attrs).length) return p.name + ' — ' + Object.values(p.attrs).join(' / '); return p.name; };
  CS.findByBarcode = (code) => { code = String(code).trim(); if (!code) return null; return CS.db.products.find((p) => p.active !== false && (p.barcode === code || p.code === code || (p.barcodes || []).includes(code))); };
  CS.priceOf = (p, listIdx = 0) => { if (!p) return 0; if (listIdx > 0 && p.prices && CS.num(p.prices[listIdx])) return CS.num(p.prices[listIdx]); return CS.num(p.sell); };
  CS.recalcStock = function () {
    const db = CS.db; const map = {};
    db.products.forEach((p) => (p.stock = {}));
    db.moves.forEach((m) => { const p = map[m.pid] || (map[m.pid] = db.products.find((x) => x.id === m.pid)); if (!p) return; p.stock[m.wh] = CS.round((p.stock[m.wh] || 0) + m.qty, 3); });
  };
  CS.stockOf = (p, wh) => { if (typeof p === 'string') p = CS.product(p); if (!p) return 0; if (p.service) return Infinity; if (wh) return p.stock?.[wh] || 0; return CS.sum(Object.values(p.stock || {}), (x) => x); };
  CS.addMove = function (m) {
    const p = CS.product(m.pid); if (!p || p.service) return;
    // reçeteli (kombine) ürün satılırken bileşen stokları düşer
    if (p.recipe && p.recipe.length && p.kit && m.qty < 0 && ['satis', 'pos', 'irsaliye', 'alis_iade'].includes(m.type)) {
      p.recipe.forEach((r) => CS.addMove({ ...m, pid: r.pid, qty: m.qty * r.qty, note: 'Kombine: ' + p.name }));
      return;
    }
    const mv = Object.assign({ id: CS.uid(), date: CS.today(), at: CS.now(), cost: CS.num(p.buy) }, m);
    CS.db.moves.push(mv); p.stock = p.stock || {}; p.stock[mv.wh] = CS.round((p.stock[mv.wh] || 0) + mv.qty, 3);
    return mv;
  };
  CS.removeMovesByRef = function (ref) { const before = CS.db.moves.length; CS.db.moves = CS.db.moves.filter((m) => m.ref !== ref); if (before !== CS.db.moves.length) CS.recalcStock(); };
  CS.isCritical = (p) => !p.service && p.active !== false && CS.num(p.critical) > 0 && CS.stockOf(p) <= CS.num(p.critical);
  CS.categoryName = (id) => CS.byId('categories', id)?.name || '';
  CS.whName = (id) => CS.byId('warehouses', id)?.name || '';
  CS.defaultWh = () => (CS.user && CS.user.warehouseId && CS.byId('warehouses', CS.user.warehouseId) ? CS.user.warehouseId : CS.db.warehouses[0]?.id);

  /* ---------------- Cari ---------------- */
  CS.contact = (id) => CS.byId('contacts', id);
  CS.contactName = (id) => CS.contact(id)?.name || '';
  // amt > 0 : cari bize borçlanır (alacağımız artar); amt < 0 : cari alacaklanır
  CS.addLedger = (e) => { const x = Object.assign({ id: CS.uid(), date: CS.today(), at: CS.now() }, e); CS.db.ledger.push(x); return x; };
  CS.removeLedgerByRef = (ref) => { CS.db.ledger = CS.db.ledger.filter((l) => l.ref !== ref); };
  CS.balance = (cid, upto) => CS.round(CS.sum(CS.db.ledger.filter((l) => l.cid === cid && (!upto || l.date <= upto)), 'amt') + 0);
  CS.balanceLabel = (b) => (Math.abs(b) < 0.005 ? '<span class="muted">0,00 ₺</span>' : b > 0 ? `<span class="pos">${CS.money(b)} (B)</span>` : `<span class="neg">${CS.money(-b)} (A)</span>`);
  CS.balanceText = (b) => (Math.abs(b) < 0.005 ? '0,00 ₺' : b > 0 ? CS.money(b) + ' alacağımız' : CS.money(-b) + ' borcumuz');

  /* ---------------- Kasa / banka ---------------- */
  CS.account = (id) => CS.byId('accounts', id);
  CS.ACC_TYPES = { kasa: 'Kasa', banka: 'Banka hesabı', kart: 'Kredi kartı', pos: 'POS / Sanal POS', vadeli: 'Vadeli mevduat', doviz: 'Döviz hesabı' };
  CS.accBalance = (id, upto) => { const a = CS.account(id); if (!a) return 0; return CS.round(CS.num(a.opening) + CS.sum(CS.db.accMoves.filter((m) => m.accId === id && (!upto || m.date <= upto)), 'amt')); };
  CS.addAccMove = (m) => { const x = Object.assign({ id: CS.uid(), date: CS.today(), at: CS.now(), userId: CS.user?.id, branchId: CS.branchId }, m); x.amt = CS.round(x.amt); CS.db.accMoves.push(x); return x; };
  CS.removeAccMovesByRef = (ref) => { CS.db.accMoves = CS.db.accMoves.filter((m) => m.ref !== ref); };
  CS.accountsOf = (types) => CS.db.accounts.filter((a) => !a.closed && (!types || types.includes(a.type)));

  /** Tahsilat (dir:'in') / Ödeme (dir:'out') — kasa/banka + cari etkisi */
  CS.payment = function ({ dir, cid, accId, amount, date, desc, ref, method, projectId, docId }) {
    amount = CS.round(CS.num(amount)); if (!amount) return;
    const id = ref || 'pay_' + CS.uid(); const sign = dir === 'in' ? 1 : -1;
    if (accId) CS.addAccMove({ accId, amt: sign * amount, date, desc: desc || (dir === 'in' ? 'Tahsilat' : 'Ödeme') + (cid ? ' — ' + CS.contactName(cid) : ''), ref: id, cid, kind: dir === 'in' ? 'tahsilat' : 'odeme', method, projectId, docId });
    if (cid) CS.addLedger({ cid, amt: -sign * amount, date, desc: desc || (dir === 'in' ? 'Tahsilat' : 'Ödeme'), ref: id, kind: dir === 'in' ? 'tahsilat' : 'odeme', accId, docId });
    return id;
  };

  /* ---------------- Belgeler (fatura, irsaliye, teklif, sipariş, POS) ---------------- */
  CS.DOC_TYPES = {
    satis: { label: 'Satış faturası', short: 'Satış', prefix: 'SF', stock: -1, cari: 1, side: 'sale', invoice: true },
    alis: { label: 'Alış faturası', short: 'Alış', prefix: 'AF', stock: 1, cari: -1, side: 'buy', invoice: true },
    satis_iade: { label: 'Satıştan iade faturası', short: 'Satış iade', prefix: 'SI', stock: 1, cari: -1, side: 'sale', invoice: true, ret: true },
    alis_iade: { label: 'Alıştan iade faturası', short: 'Alış iade', prefix: 'AI', stock: -1, cari: 1, side: 'buy', invoice: true, ret: true },
    pos: { label: 'Perakende satış fişi', short: 'POS', prefix: 'PS', stock: -1, cari: 1, side: 'sale' },
    pos_iade: { label: 'Perakende iade fişi', short: 'POS iade', prefix: 'PI', stock: 1, cari: -1, side: 'sale', ret: true },
    irsaliye: { label: 'Sevk irsaliyesi', short: 'İrsaliye', prefix: 'SV', stock: -1, cari: 0, side: 'sale' },
    alis_irsaliye: { label: 'Alış irsaliyesi', short: 'Alış irs.', prefix: 'AV', stock: 1, cari: 0, side: 'buy' },
    teklif: { label: 'Satış teklifi', short: 'Teklif', prefix: 'TK', stock: 0, cari: 0, side: 'sale' },
    siparis: { label: 'Müşteri siparişi', short: 'Sipariş', prefix: 'MS', stock: 0, cari: 0, side: 'sale' },
    alis_siparis: { label: 'Tedarikçi siparişi', short: 'Satın alma', prefix: 'TS', stock: 0, cari: 0, side: 'buy' }
  };
  CS.EDOC = { kagit: 'Kağıt / matbu', efatura: 'e-Fatura', earsiv: 'e-Arşiv', eirsaliye: 'e-İrsaliye', eihracat: 'e-İhracat', esmm: 'e-SMM' };
  CS.KDV_RATES = [0, 1, 10, 20];
  CS.CURRENCIES = ['₺', 'USD', 'EUR', 'GBP'];

  /** Satır hesaplama. Fiyatlar KDV hariç tutulur (line.price) */
  CS.calcLine = function (l) {
    const qty = CS.num(l.qty), price = CS.num(l.price), disc = CS.num(l.disc), kdv = CS.num(l.kdv), otv = CS.num(l.otv);
    const gross = qty * price; const discAmt = gross * disc / 100; const net = gross - discAmt; const otvAmt = net * otv / 100; const kdvAmt = (net + otvAmt) * kdv / 100;
    return { gross, discAmt, net, otvAmt, kdvAmt, total: net + otvAmt + kdvAmt };
  };
  CS.calcDoc = function (doc) {
    let gross = 0, disc = 0, net = 0, kdv = 0, otv = 0; const kdvBy = {};
    (doc.lines || []).forEach((l) => { const c = CS.calcLine(l); gross += c.gross; disc += c.discAmt; net += c.net; kdv += c.kdvAmt; otv += c.otvAmt; kdvBy[l.kdv] = (kdvBy[l.kdv] || 0) + c.kdvAmt; });
    // genel indirim (alt toplam iskontosu) — KDV dahil tutar üzerinden oransal
    const pre = net + otv + kdv; let gDisc = CS.num(doc.gdisc); if (doc.gdiscPct) gDisc = pre * CS.num(doc.gdiscPct) / 100;
    const ratio = pre ? (pre - gDisc) / pre : 1;
    const t = { gross, disc: disc + (net * (1 - ratio)), net: net * ratio, kdv: kdv * ratio, otv: otv * ratio, total: CS.round(pre - gDisc), gDisc, kdvBy: {} };
    for (const k in kdvBy) t.kdvBy[k] = kdvBy[k] * ratio;
    // tevkifat
    if (CS.num(doc.withholding)) { t.withholding = CS.round(t.kdv * CS.num(doc.withholding) / 10); t.total = CS.round(t.total - t.withholding); }
    t.totalTry = CS.round(t.total * (CS.num(doc.rate) || 1));
    return t;
  };
  CS.docPaid = (doc) => CS.round(CS.sum(CS.db.accMoves.filter((m) => m.docId === doc.id && m.kind !== 'pos_cash'), (m) => Math.abs(m.amt)) + CS.sum(CS.db.cheques.filter((c) => c.docId === doc.id), 'amount'));

  /** Belgeyi kaydeder ve stok + cari etkilerini (yeniden) uygular */
  CS.postDoc = function (doc) {
    const T = CS.DOC_TYPES[doc.type]; const db = CS.db;
    if (!doc.id) { doc.id = 'd_' + CS.uid(); doc.createdAt = CS.now(); doc.userId = CS.user?.id; doc.branchId = doc.branchId || CS.branchId; }
    if (!doc.no) doc.no = CS.nextNo(T.prefix);
    doc.updatedAt = CS.now();
    const totals = CS.calcDoc(doc); doc.total = totals.total; doc.totalTry = totals.totalTry; doc.kdvTotal = totals.kdv; doc.net = totals.net;
    const rate = CS.num(doc.rate) || 1; const existed = db.docs.some((d) => d.id === doc.id); if (!existed) CS.costChanges = [];
    // önceki etkileri kaldır
    CS.removeMovesByRef(doc.id); db.ledger = db.ledger.filter((l) => !(l.ref === doc.id && l.kind === 'belge'));
    if (doc.status !== 'iptal') {
      const stockEffect = T.stock && !doc.noStock;
      if (stockEffect) {
        doc.lines.forEach((l) => {
          if (!l.pid) return; const p = CS.product(l.pid); if (!p) return;
          const qty = CS.num(l.qty) * (CS.num(l.factor) || 1);
          const isBuy = ['alis', 'alis_irsaliye'].includes(doc.type);
          const unitDoc = CS.num(l.price) * (1 - CS.num(l.disc) / 100) / (CS.num(l.factor) || 1);
          // stoktaki ürüne yeni fiyattan alış: maliyet (ortalama / son alış) ve marjlı satış fiyatları yeniden hesaplanır
          if (isBuy && !existed && db.settings.lastPurchaseUpdatesCost !== false && unitDoc > 0) CS.updateCost(p, qty, CS.round(unitDoc * rate, 6), { no: doc.no, unitFx: p.cur && p.cur !== '₺' && doc.currency === p.cur ? unitDoc : null });
          l.cost = l.cost ?? (isBuy && unitDoc > 0 ? CS.round(unitDoc * rate, 4) : CS.num(p.buy));
          CS.addMove({ pid: l.pid, wh: doc.wh || CS.defaultWh(), qty: T.stock * qty, type: doc.type, ref: doc.id, date: doc.date, price: CS.num(l.price) * rate, cost: l.cost, cid: doc.cid, note: doc.no });
        });
      } else if (T.side === 'sale') {
        doc.lines.forEach((l) => { if (l.pid && l.cost == null) l.cost = CS.num(CS.product(l.pid)?.buy); });
      }
      if (T.cari && doc.cid && !doc.noCari) CS.addLedger({ cid: doc.cid, amt: T.cari * totals.totalTry, date: doc.date, due: doc.due, desc: `${T.label} ${doc.no}`, ref: doc.id, kind: 'belge', docId: doc.id });
    }
    const i = db.docs.findIndex((d) => d.id === doc.id); if (i >= 0) db.docs[i] = doc; else db.docs.push(doc);
    CS.log((i >= 0 ? 'Belge güncellendi: ' : 'Belge oluşturuldu: ') + T.label, doc.no + ' — ' + CS.money(doc.total, doc.currency));
    CS.save();
    return doc;
  };
  CS.deleteDoc = function (doc) {
    CS.removeMovesByRef(doc.id); CS.removeLedgerByRef(doc.id);
    // belgeye bağlı ödemeler
    const payRefs = new Set(CS.db.accMoves.filter((m) => m.docId === doc.id).map((m) => m.ref));
    CS.db.accMoves = CS.db.accMoves.filter((m) => !payRefs.has(m.ref) && m.ref !== doc.id);
    CS.db.ledger = CS.db.ledger.filter((l) => !payRefs.has(l.ref));
    CS.db.docs = CS.db.docs.filter((d) => d.id !== doc.id);
    CS.log('Belge silindi', doc.no); CS.save();
  };
  CS.docsOf = (types) => CS.db.docs.filter((d) => types.includes(d.type));
  CS.saleDocs = (from, to) => CS.db.docs.filter((d) => ['satis', 'pos'].includes(d.type) && d.status !== 'iptal' && (!from || d.date >= from) && (!to || d.date <= to));
  CS.returnDocs = (from, to) => CS.db.docs.filter((d) => ['satis_iade', 'pos_iade'].includes(d.type) && d.status !== 'iptal' && (!from || d.date >= from) && (!to || d.date <= to));
  /** satış satırlarını düz liste olarak verir (iade negatif) */
  CS.saleLines = function (from, to, filter) {
    const out = [];
    CS.db.docs.forEach((d) => {
      if (d.status === 'iptal') return; const T = CS.DOC_TYPES[d.type]; if (T.side !== 'sale' || !T.invoice && d.type !== 'pos' && d.type !== 'pos_iade') return;
      if (from && d.date < from) return; if (to && d.date > to) return; if (filter && !filter(d)) return;
      const t = CS.calcDoc(d); const pre = CS.sum(d.lines, (l) => CS.calcLine(l).total) || 1; const ratio = t.total / pre; const rate = CS.num(d.rate) || 1; const sg = T.ret ? -1 : 1;
      d.lines.forEach((l) => { const c = CS.calcLine(l); const qty = CS.num(l.qty) * (CS.num(l.factor) || 1); out.push({ doc: d, line: l, pid: l.pid, qty: sg * qty, net: sg * c.net * ratio * rate, total: sg * c.total * ratio * rate, kdv: sg * c.kdvAmt * ratio * rate, cost: sg * qty * CS.num(l.cost ?? CS.product(l.pid)?.buy), date: d.date, cid: d.cid, userId: d.sellerId || d.userId, branchId: d.branchId }); });
    });
    return out;
  };

  /* ---------------- Yetki ---------------- */
  CS.role = () => CS.byId('roles', CS.user?.roleId);
  CS.can = (mod, act = 'v') => { const r = CS.role(); if (!r) return false; if (r.id === 'r_admin') return true; return !!(r.perms[mod] && r.perms[mod][act]); };

  /* ---------------- Arayüz yardımcıları ---------------- */
  CS.toast = function (msg, kind = 'ok', ms = 2600) {
    let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; box.appendChild(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  };

  /** Modal: CS.modal({title, body(html|el), size, buttons:[{label, kind, onClick(close, el) -> false keeps open}], onOpen(el)}) */
  CS.modal = function (o) {
    const wrap = document.createElement('div'); wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal ${o.size || ''}" role="dialog" aria-modal="true" aria-label="${CS.esc(o.title)}"><header><h2>${CS.esc(o.title)}</h2><button class="icon-btn" data-x aria-label="Kapat">${CS.icon('x')}</button></header><div class="modal-body"></div><footer></footer></div>`;
    const body = $('.modal-body', wrap); if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    const foot = $('footer', wrap); const prevFocus = document.activeElement;
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); o.onClose && o.onClose(); prevFocus && prevFocus.focus && prevFocus.focus(); };
    (o.buttons || [{ label: 'Kapat' }]).forEach((b) => { const btn = document.createElement('button'); btn.className = 'btn ' + (b.kind || ''); btn.textContent = b.label; btn.type = 'button'; btn.onclick = async () => { if (b.onClick) { const r = await b.onClick(close, wrap); if (r === false) return; } close(); }; foot.appendChild(btn); });
    if (!foot.children.length) foot.remove();
    $('[data-x]', wrap).onclick = close; wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && !o.sticky) close(); });
    const onKey = (e) => { if (e.key === 'Escape' && document.body.lastElementChild === wrap) { e.stopPropagation(); close(); } if (e.key === 'Enter' && e.ctrlKey) { const p = $('footer .btn.primary', wrap); p && p.click(); } };
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap); o.onOpen && o.onOpen(wrap, close);
    setTimeout(() => { const f = $('[autofocus]', wrap) || $('input:not([type=hidden]):not([readonly]),select,textarea', body); f && f.focus(); }, 30);
    return { el: wrap, close };
  };
  CS.confirm = (msg, onYes, yesLabel = 'Sil', kind = 'danger') => CS.modal({ title: 'Onay', body: `<p>${CS.esc(msg)}</p>`, size: 'sm', buttons: [{ label: 'Vazgeç' }, { label: yesLabel, kind, onClick: () => onYes() }] });
  CS.prompt = (title, label, value, onOk) => CS.modal({ title, size: 'sm', body: `<label class="fld"><span>${CS.esc(label)}</span><input id="pv" value="${CS.esc(value || '')}"></label>`, buttons: [{ label: 'Vazgeç' }, { label: 'Tamam', kind: 'primary', onClick: (c, el) => onOk($('#pv', el).value) }] });

  /** Form oluşturucu. fields: [{k, l, t:'text|number|money|date|select|textarea|check|color|file', opts:[[v,l]], req, w:'half|third|full', ph, help}] */
  CS.form = function (fields, data = {}) {
    const el = document.createElement('div'); el.className = 'form-grid';
    el.innerHTML = fields.map((f) => {
      if (f.t === 'sep') return `<h3 class="form-sep">${CS.esc(f.l)}</h3>`;
      const v = data[f.k] ?? f.def ?? ''; const id = 'f_' + f.k; const w = f.w || 'half'; const req = f.req ? ' required' : '';
      let inp;
      if (f.t === 'select') inp = `<select id="${id}" name="${f.k}"${req}>${(typeof f.opts === 'function' ? f.opts() : f.opts).map((o) => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${CS.esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${CS.esc(ol)}</option>`; }).join('')}</select>`;
      else if (f.t === 'textarea') inp = `<textarea id="${id}" name="${f.k}" rows="${f.rows || 3}" placeholder="${CS.esc(f.ph || '')}">${CS.esc(v)}</textarea>`;
      else if (f.t === 'check') return `<label class="chk ${w}"><input type="checkbox" id="${id}" name="${f.k}" ${v ? 'checked' : ''}> <span>${CS.esc(f.l)}</span></label>`;
      else { const type = f.t === 'money' || f.t === 'number' ? 'text' : f.t || 'text'; const mode = f.t === 'money' || f.t === 'number' ? ' inputmode="decimal"' : ''; const val = (f.t === 'money') && v !== '' ? String(v).replace('.', ',') : v; inp = `<input id="${id}" name="${f.k}" type="${type}"${mode} value="${CS.esc(val)}" placeholder="${CS.esc(f.ph || '')}"${req}${f.list ? ` list="${f.list}"` : ''}${f.ro ? ' readonly' : ''}>`; }
      return `<label class="fld ${w}"><span>${CS.esc(f.l)}${f.req ? ' *' : ''}</span>${inp}${f.help ? `<small>${CS.esc(f.help)}</small>` : ''}</label>`;
    }).join('');
    el.read = function () {
      const out = {}; let ok = true;
      fields.forEach((f) => {
        if (f.t === 'sep') return; const i = $('#f_' + f.k, el); if (!i) return;
        let v = f.t === 'check' ? i.checked : i.value.trim();
        if (f.t === 'money' || f.t === 'number') v = v === '' ? (f.req ? NaN : '') : CS.num(v);
        if (f.req && (v === '' || (typeof v === 'number' && isNaN(v)))) { ok = false; i.classList.add('err'); } else i.classList.remove('err');
        out[f.k] = v;
      });
      if (!ok) { CS.toast('Zorunlu alanları doldurun.', 'bad'); return null; }
      return out;
    };
    return el;
  };

  /** Tablo: CS.table(el, {cols:[{k,l,f(row),a:'r',sort}], rows, actions(row)->html, onRow, search, pageSize, empty, foot}) */
  CS.table = function (el, o) {
    const st = { q: '', sort: o.sortKey || null, dir: o.sortDir || 1, page: 0 };
    const size = o.pageSize || 50;
    function val(c, r) { return c.v ? c.v(r) : c.k ? r[c.k] : ''; }
    function draw() {
      let rows = o.rows.slice();
      if (st.q) rows = rows.filter((r) => CS.match(o.searchText ? o.searchText(r) : o.cols.map((c) => { const v = val(c, r); return typeof v === 'object' ? '' : v; }).join(' '), st.q));
      if (st.sort != null) { const c = o.cols[st.sort]; rows.sort((a, b) => { const x = val(c, a), y = val(c, b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'tr')) * st.dir; }); }
      const pages = Math.max(1, Math.ceil(rows.length / size)); st.page = Math.min(st.page, pages - 1); const slice = rows.slice(st.page * size, st.page * size + size);
      const tb = $('tbody', el);
      tb.innerHTML = slice.length ? slice.map((r, i) => `<tr data-i="${st.page * size + i}" ${o.onRow ? 'class="click"' : ''} ${o.rowClass ? `class="${o.rowClass(r)} ${o.onRow ? 'click' : ''}"` : ''}>${o.cols.map((c) => `<td class="${c.a === 'r' ? 'r' : ''} ${c.cls || ''}" data-l="${CS.esc(c.l)}">${c.f ? c.f(r) : CS.esc(val(c, r))}</td>`).join('')}${o.actions ? `<td class="acts">${o.actions(r)}</td>` : ''}</tr>`).join('') : `<tr><td colspan="${o.cols.length + (o.actions ? 1 : 0)}" class="empty">${o.empty || 'Kayıt yok.'}</td></tr>`;
      tb._rows = rows;
      $('.tbl-info', el).textContent = `${rows.length} kayıt` + (pages > 1 ? ` · sayfa ${st.page + 1}/${pages}` : '');
      $('.tbl-prev', el).disabled = st.page === 0; $('.tbl-next', el).disabled = st.page >= pages - 1;
      $('.tbl-pager', el).style.display = pages > 1 ? '' : 'none';
      if (o.foot) $('tfoot', el).innerHTML = o.foot(rows);
      $$('th[data-c]', el).forEach((th) => th.setAttribute('aria-sort', +th.dataset.c === st.sort ? (st.dir > 0 ? 'ascending' : 'descending') : 'none'));
    }
    el.innerHTML = `${o.search !== false ? `<div class="tbl-tools"><input type="search" class="tbl-q" placeholder="${o.ph || 'Listede ara…'}" aria-label="Listede ara">${o.tools || ''}</div>` : ''}<div class="tbl-wrap"><table class="tbl"><thead><tr>${o.cols.map((c, i) => `<th data-c="${i}" class="${c.a === 'r' ? 'r' : ''}" tabindex="0">${CS.esc(c.l)}</th>`).join('')}${o.actions ? '<th class="acts"></th>' : ''}</tr></thead><tbody></tbody><tfoot></tfoot></table></div><div class="tbl-bottom"><span class="tbl-info muted"></span><span class="tbl-pager"><button class="btn sm tbl-prev">Önceki</button><button class="btn sm tbl-next">Sonraki</button></span></div>`;
    const q = $('.tbl-q', el); if (q) q.addEventListener('input', CS.debounce(() => { st.q = q.value; st.page = 0; draw(); }, 150));
    $$('th[data-c]', el).forEach((th) => { const go = () => { const c = +th.dataset.c; if (st.sort === c) st.dir *= -1; else { st.sort = c; st.dir = 1; } draw(); }; th.onclick = go; th.onkeydown = (e) => e.key === 'Enter' && go(); });
    $('.tbl-prev', el).onclick = () => { st.page--; draw(); }; $('.tbl-next', el).onclick = () => { st.page++; draw(); };
    $('tbody', el).addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (!tr) return; const row = $('tbody', el)._rows[+tr.dataset.i]; const a = e.target.closest('[data-act]'); if (a) { e.stopPropagation(); o.onAct && o.onAct(a.dataset.act, row, a); return; } if (o.onRow && !e.target.closest('button,a,input,select')) o.onRow(row); });
    draw();
    return { redraw: (rows) => { if (rows) o.rows = rows; draw(); }, rows: () => $('tbody', el)._rows, state: st };
  };
  CS.actBtn = (act, label, icon, kind = '') => `<button class="icon-btn ${kind}" data-act="${act}" title="${CS.esc(label)}" aria-label="${CS.esc(label)}">${CS.icon(icon)}</button>`;

  /** Ürün seçici (arama + barkod) */
  CS.pickProduct = function (onPick, opts = {}) {
    const m = CS.modal({ title: opts.title || 'Ürün seç', size: 'lg', body: `<div class="pick"><input id="pq" type="search" placeholder="Ürün adı, barkod veya stok kodu" autofocus><div id="pl" class="pick-list"></div></div>`, buttons: [{ label: 'Kapat' }] });
    const q = $('#pq', m.el), list = $('#pl', m.el);
    const draw = () => {
      const s = q.value.trim(); const ps = CS.db.products.filter((p) => p.active !== false && !(p.variants && p.variants.length) && (!s || CS.match(p.name + ' ' + p.barcode + ' ' + p.code + ' ' + Object.values(p.attrs || {}).join(' '), s))).slice(0, 80);
      list.innerHTML = ps.map((p) => `<button class="pick-row" data-id="${p.id}"><span><b>${CS.esc(CS.productName(p))}</b><small>${CS.esc(p.barcode || p.code || '')} · ${CS.esc(CS.categoryName(p.cat))}</small></span><span class="r"><b>${CS.money(opts.buy ? p.buy : p.sell)}</b><small>Stok: ${p.service ? '—' : CS.qty(CS.stockOf(p, opts.wh))} ${CS.esc(p.unit || '')}</small></span></button>`).join('') || '<p class="empty">Eşleşen ürün yok.</p>';
    };
    q.addEventListener('input', draw);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const p = CS.findByBarcode(q.value); if (p) { onPick(p); if (!opts.multi) m.close(); else { q.value = ''; draw(); CS.toast(CS.productName(p) + ' eklendi'); } } else { const f = $('.pick-row', list); f && f.click(); } } });
    list.onclick = (e) => { const b = e.target.closest('.pick-row'); if (!b) return; onPick(CS.product(b.dataset.id)); if (!opts.multi) m.close(); else CS.toast(CS.productName(CS.product(b.dataset.id)) + ' eklendi'); };
    draw();
  };
  CS.contactOptions = (kind, empty = '— Seçiniz —') => [['', empty]].concat(CS.db.contacts.filter((c) => !c.archived && (!kind || c.kind === kind || c.kind === 'both')).sort((a, b) => a.name.localeCompare(b.name, 'tr')).map((c) => [c.id, c.name]));
  CS.accOptions = (types, empty) => (empty ? [['', empty]] : []).concat(CS.accountsOf(types).map((a) => [a.id, `${a.name} (${CS.ACC_TYPES[a.type]})`]));
  CS.whOptions = () => CS.db.warehouses.map((w) => [w.id, w.name]);
  CS.projOptions = () => [['', '— Proje yok —']].concat(CS.db.projects.map((p) => [p.id, p.name]));
  CS.staffOptions = () => [['', '— Personel —']].concat(CS.db.staff.filter((s) => s.active !== false).map((s) => [s.id, s.name]));
  CS.userName = (id) => CS.byId('users', id)?.name || '';

  /* ---------------- Dışa aktarım ---------------- */
  CS.exportCSV = function (name, cols, rows) {
    const line = (arr) => arr.map((v) => { v = v == null ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';');
    const csv = '﻿' + [line(cols)].concat(rows.map(line)).join('\r\n');
    CS.download(name + '.csv', csv, 'text/csv;charset=utf-8');
  };
  CS.exportXLS = function (name, cols, rows, title) {
    if (window.XLSX) { const ws = XLSX.utils.aoa_to_sheet([cols].concat(rows)); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Rapor'); XLSX.writeFile(wb, name + '.xlsx'); return; }
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${title ? `<h3>${CS.esc(title)}</h3>` : ''}<table border="1"><tr>${cols.map((c) => `<th>${CS.esc(c)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((v) => `<td>${CS.esc(v)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
    CS.download(name + '.xls', html, 'application/vnd.ms-excel');
  };
  CS.printHTML = function (html, title = 'CepStok', css = '') {
    const w = window.open('', '_blank', 'width=900,height=700'); if (!w) { CS.toast('Açılır pencere engellendi. Tarayıcıda bu site için açılır pencerelere izin verin.', 'bad'); return; }
    w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${CS.esc(title)}</title><style>body{font:12px/1.45 Archivo,system-ui,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border-bottom:1px solid #ccc;padding:5px 6px;text-align:left;vertical-align:top}th{background:#f1f1f1}td.r,th.r{text-align:right}.muted{color:#666}.tot td{font-weight:700;border-top:2px solid #111}.hdr{display:flex;justify-content:space-between;gap:24px;margin-bottom:12px}.box{border:1px solid #bbb;padding:8px 10px;border-radius:4px}@page{margin:12mm}${css}</style></head><body>${html}<script>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  };

  /* ---------------- Barkod (EAN-13 / Code128) ---------------- */
  const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const EAN_P = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  CS.ean13Check = (d12) => { let s = 0; for (let i = 0; i < 12; i++) s += +d12[i] * (i % 2 ? 3 : 1); return (10 - (s % 10)) % 10; };
  CS.genBarcode = (src) => { let base, code, n = 0; do { base = src ? ('20' + String(src).replace(/\D/g, '').padStart(3, '0').slice(-3) + String(Date.now()).slice(-3) + String(Math.floor(Math.random() * 1e4)).padStart(4, '0')) : ('869' + String(Date.now()).slice(-5) + String(Math.floor(Math.random() * 1e4)).padStart(4, '0')); code = base + CS.ean13Check(base); n++; } while (n < 20 && CS.db && CS.db.products.some((p) => p.barcode === code)); return code; };
  const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
  CS.barcodeSVG = function (code, h = 50, showText = true) {
    code = String(code || '').trim(); if (!code) return '';
    let bits = '';
    if (/^\d{13}$/.test(code) && CS.ean13Check(code) === +code[12]) {
      const p = EAN_P[+code[0]]; bits = '101'; for (let i = 1; i < 7; i++) bits += (p[i - 1] === 'L' ? EAN_L : EAN_G)[+code[i]]; bits += '01010'; for (let i = 7; i < 13; i++) bits += EAN_R[+code[i]]; bits += '101';
      const w = bits.length + 18; let r = ''; for (let i = 0; i < bits.length; i++) if (bits[i] === '1') { const guard = i < 3 || (i > 44 && i < 50) || i > 91; r += `<rect x="${i + 9}" y="0" width="1" height="${guard ? h + 5 : h}"/>`; }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h + (showText ? 14 : 6)}" class="bc">${r}${showText ? `<text x="2" y="${h + 12}" font-size="10" font-family="monospace">${code[0]}</text><text x="${9 + 23}" y="${h + 12}" font-size="10" font-family="monospace" text-anchor="middle">${code.slice(1, 7)}</text><text x="${9 + 69}" y="${h + 12}" font-size="10" font-family="monospace" text-anchor="middle">${code.slice(7)}</text>` : ''}</svg>`;
    }
    // Code128-B
    const vals = [104]; for (const ch of code) { const c = ch.charCodeAt(0); vals.push(c >= 32 && c < 128 ? c - 32 : 0); }
    let sum = vals[0]; for (let i = 1; i < vals.length; i++) sum += vals[i] * i; vals.push(sum % 103); vals.push(106);
    let x = 10, r = ''; vals.forEach((v) => { const pat = C128[v]; for (let i = 0; i < pat.length; i++) { const w = +pat[i]; if (i % 2 === 0) r += `<rect x="${x}" y="0" width="${w}" height="${h}"/>`; x += w; } });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 10} ${h + (showText ? 14 : 4)}" class="bc">${r}${showText ? `<text x="${(x + 10) / 2}" y="${h + 12}" font-size="10" font-family="monospace" text-anchor="middle">${CS.esc(code)}</text>` : ''}</svg>`;
  };

  /* ---------------- Kamera ile barkod okuma ---------------- */
  CS.scan = async function (onCode) {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices) { CS.toast('Bu tarayıcı kamerayla barkod okumayı desteklemiyor. Chrome (Android) veya USB barkod okuyucu kullanın.', 'bad', 4000); return; }
    const m = CS.modal({ title: 'Kamerayla barkod oku', body: '<video id="cam" playsinline muted style="width:100%;border-radius:8px;background:#000"></video><p class="muted">Barkodu kameraya tutun.</p>', onClose: () => { stop = true; stream && stream.getTracks().forEach((t) => t.stop()); } });
    let stop = false, stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); const v = $('#cam', m.el); v.srcObject = stream; await v.play();
      const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'] });
      const loop = async () => { if (stop) return; try { const r = await det.detect(v); if (r.length) { m.close(); onCode(r[0].rawValue); return; } } catch (e) { } requestAnimationFrame(loop); }; loop();
    } catch (e) { CS.toast('Kameraya erişilemedi: ' + e.message, 'bad'); m.close(); }
  };

  /* ---------------- Basit SVG grafikleri ---------------- */
  CS.barChart = function (data, o = {}) { // data: [{label, value, value2?}]
    if (!data.length) return '<p class="empty">Gösterilecek veri yok.</p>';
    const W = 640, H = o.h || 220, pad = 34, bw = (W - pad - 10) / data.length; const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.value2 || 0)));
    const ticks = [0, 0.5, 1].map((t) => `<line x1="${pad}" x2="${W}" y1="${H - 22 - t * (H - 40)}" y2="${H - 22 - t * (H - 40)}" class="grid"/><text x="${pad - 4}" y="${H - 18 - t * (H - 40)}" text-anchor="end" class="ax">${CS.short(max * t)}</text>`).join('');
    const bars = data.map((d, i) => { const h = (d.value / max) * (H - 40); const h2 = ((d.value2 || 0) / max) * (H - 40); const x = pad + i * bw + bw * 0.15; const w = o.two ? bw * 0.34 : bw * 0.7; return `<g><title>${CS.esc(d.label)}: ${CS.fmt2(d.value)}${o.two ? ' / ' + CS.fmt2(d.value2) : ''}</title><rect x="${x}" y="${H - 22 - h}" width="${w}" height="${Math.max(0, h)}" rx="2" class="b1"/>${o.two ? `<rect x="${x + w + 2}" y="${H - 22 - h2}" width="${w}" height="${Math.max(0, h2)}" rx="2" class="b2"/>` : ''}${data.length <= 16 || i % Math.ceil(data.length / 12) === 0 ? `<text x="${x + (o.two ? w : w / 2)}" y="${H - 6}" text-anchor="middle" class="ax">${CS.esc(d.label)}</text>` : ''}</g>`; }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${CS.esc(o.title || 'Grafik')}">${ticks}${bars}</svg>${o.two ? `<div class="legend"><span class="k1"></span>${CS.esc(o.l1 || '')}<span class="k2"></span>${CS.esc(o.l2 || '')}</div>` : ''}`;
  };
  CS.short = (n) => { const a = Math.abs(n); if (a >= 1e6) return CS.round(n / 1e6, 1).toLocaleString('tr-TR') + ' Mn'; if (a >= 1e3) return CS.round(n / 1e3, 1).toLocaleString('tr-TR') + ' B'; return CS.round(n, 0).toLocaleString('tr-TR'); };

  /* ---------------- Simgeler ---------------- */
  const IC = {
    home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', cart: 'M3 4h2l2.4 11h11l2-8H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', box: 'M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5', users: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M8 13h8M8 17h6',
    clip: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12h8M8 16h5', wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-3v3M16 13h2', cheque: 'M2 6h20v12H2zM6 10h7M6 14h4M16 14h2', trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    id: 'M4 4h16v16H4zM9 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 16c.5-2 1.8-3 3-3s2.5 1 3 3M14 9h4M14 13h4', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14.4H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
    plug: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4', factory: 'M2 20V9l6 4V9l6 4V4h4l2 16zM2 20h20', x: 'M6 6l12 12M18 6L6 18', plus: 'M12 5v14M5 12h14', edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z', down: 'M12 4v12M6 10l6 6 6-6M4 20h16', up: 'M12 20V8M6 14l6-6 6 6M4 4h16', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
    menu: 'M3 6h18M3 12h18M3 18h18', barcode: 'M3 5v14M6 5v14M10 5v14M13 5v14M17 5v14M21 5v14M8 5v14', cam: 'M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7', copy: 'M8 8h12v12H8zM4 16V4h12',
    bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0', moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z', sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4', out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z', tag: 'M20 12l-8 8-9-9V3h8zM7.5 7.5h.01', truck: 'M1 4h14v12H1zM15 9h4l3 3v4h-7M5.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', check: 'M4 12l5 5L20 6', pause: 'M7 4h4v16H7zM13 4h4v16h-4z', ret: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
    building: 'M4 21V3h11v18M15 9h5v12M8 7h3M8 11h3M8 15h3M2 21h20', briefcase: 'M3 7h18v13H3zM8 7V4h8v3M3 13h18', percent: 'M19 5L5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', monitor: 'M2 4h20v13H2zM8 21h8M12 17v4', msg: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', upload: 'M12 16V4M6 10l6-6 6 6M4 20h16', lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4'
  };
  CS.icon = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${IC[n] || IC.box}"/></svg>`;

  /* ---------------- Yönlendirme ---------------- */
  CS.modules = {}; CS.order = [];
  CS.mod = (key, def) => { CS.modules[key] = def; CS.order.push(key); };
  CS.go = (hash) => { if (location.hash === '#' + hash) CS.route(); else location.hash = hash; };
  CS.route = function () {
    if (!CS.user) return;
    const h = location.hash.replace(/^#\/?/, '') || 'dashboard'; const [path, qs] = h.split('?'); const parts = path.split('/'); const key = parts[0];
    const params = Object.fromEntries(new URLSearchParams(qs || '')); params._ = parts.slice(1);
    const M = CS.modules[key] || CS.modules.dashboard; const perm = M.perm || key;
    const main = $('#view') || $('#main');
    $$('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.k === key));
    document.body.classList.remove('nav-open');
    if (!CS.can(perm, 'v')) { main.innerHTML = `<div class="page"><div class="blank">${CS.icon('lock', 40)}<h2>Bu bölüm için yetkiniz yok</h2><p>Yöneticinizden “${CS.esc(CS.MODULE_LABELS[perm] || key)}” görüntüleme yetkisi isteyin.</p></div></div>`; return; }
    document.title = (M.title || 'CepStok') + ' — CepStok';
    main.innerHTML = ''; const page = document.createElement('div'); page.className = 'page ' + (M.cls || ''); main.appendChild(page);
    try { M.render(page, params); } catch (e) { console.error(e); page.innerHTML = `<div class="blank"><h2>Ekran yüklenemedi</h2><pre>${CS.esc(e.stack || e.message)}</pre></div>`; }
    main.scrollTop = 0; window.scrollTo(0, 0);
  };
  /** Sayfa başlığı + sekmeler */
  CS.head = function (page, title, actions = '', tabs, active) {
    const h = document.createElement('div'); h.className = 'phead';
    h.innerHTML = `<h1>${CS.esc(title)}</h1><div class="phead-acts">${actions}</div>${tabs ? `<nav class="tabs" role="tablist">${tabs.map(([k, l, href]) => `<a role="tab" href="#${href}" class="${k === active ? 'on' : ''}" aria-selected="${k === active}">${CS.esc(l)}</a>`).join('')}</nav>` : ''}`;
    page.appendChild(h); const body = document.createElement('div'); body.className = 'pbody'; page.appendChild(body); return body;
  };
  CS.kpi = (label, value, sub = '', cls = '') => `<div class="kpi ${cls}"><span class="kpi-l">${CS.esc(label)}</span><b class="kpi-v">${value}</b>${sub ? `<span class="kpi-s">${sub}</span>` : ''}</div>`;
  CS.btn = (label, act, kind = '', icon) => `<button class="btn ${kind}" data-a="${act}">${icon ? CS.icon(icon, 16) : ''}<span>${CS.esc(label)}</span></button>`;
  CS.bind = (root, map) => root.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && map[b.dataset.a] && root.contains(b)) { e.preventDefault(); map[b.dataset.a](b, e); } });
  CS.dateRange = function (el, onChange, def = 'month') {
    const t = CS.today(); const presets = { today: [t, t], week: [CS.addDays(t, -6), t], month: [t.slice(0, 8) + '01', t], lastmonth: (() => { const d = new Date(t); d.setDate(0); const e = d.toISOString().slice(0, 10); return [e.slice(0, 8) + '01', e]; })(), year: [t.slice(0, 4) + '-01-01', t], all: ['2000-01-01', '2099-12-31'] };
    el.innerHTML = `<div class="range"><select aria-label="Dönem"><option value="today">Bugün</option><option value="week">Son 7 gün</option><option value="month">Bu ay</option><option value="lastmonth">Geçen ay</option><option value="year">Bu yıl</option><option value="all">Tümü</option><option value="custom">Özel</option></select><input type="date" class="d1" aria-label="Başlangıç"><input type="date" class="d2" aria-label="Bitiş"></div>`;
    const s = $('select', el), d1 = $('.d1', el), d2 = $('.d2', el);
    const apply = () => { if (s.value !== 'custom') { [d1.value, d2.value] = presets[s.value]; } onChange(d1.value, d2.value); };
    s.value = def; s.onchange = apply; d1.onchange = d2.onchange = () => { s.value = 'custom'; onChange(d1.value, d2.value); };
    [d1.value, d2.value] = presets[def]; return { get: () => [d1.value, d2.value] };
  };
})();
