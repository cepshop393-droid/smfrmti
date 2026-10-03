/* Hızlı satış (POS) ekranı — 8 paralel sepet, barkod, terazi barkodu, kısayollar, parçalı ödeme, iade, müşteri ekranı, gün sonu */
(function () {
  const { $, $$, esc, money, icon } = CS;
  CS.EDOC.fis = 'ÖKC / bilgi fişi';
  /** KDV hariç birim fiyat */
  CS.netPrice = (p, list = 0) => { const g = CS.priceOf(p, list); return CS.db.settings.priceIncludesKdv ? CS.round(g / (1 + CS.num(p.kdv) / 100), 6) : g; };
  CS.grossPrice = (p, list = 0) => { const g = CS.priceOf(p, list); return CS.db.settings.priceIncludesKdv ? g : CS.round(g * (1 + CS.num(p.kdv) / 100), 2); };

  const CART_KEY = () => 'cepstok:carts:' + CS.companyId + ':' + CS.user.id;
  let carts, cur = 0, selLine = -1, cat = '__quick', bc;
  const newCart = () => ({ lines: [], cid: '', gdisc: 0, gdiscPct: 0, ret: false, note: '', sellerId: CS.user.id, list: 0 });
  function loadCarts() { carts = CS.ls.get(CART_KEY(), null); if (!Array.isArray(carts) || carts.length !== 8) carts = Array.from({ length: 8 }, newCart); }
  function saveCarts() { CS.ls.set(CART_KEY(), carts); broadcast(); }
  const C = () => carts[cur];
  function broadcast() { try { bc = bc || new BroadcastChannel('cepstok-display'); const c = C(); bc.postMessage({ company: CS.db.company.name, lines: c.lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, total: lineTotal(l) })), total: cartTotal(c).total, ret: c.ret, footer: CS.db.settings.receiptFooter }); } catch (e) { } }

  const lineTotal = (l) => CS.round(CS.num(l.qty) * CS.num(l.price) * (1 - CS.num(l.disc) / 100), 2);
  function cartTotal(c) { const sub = CS.sum(c.lines, lineTotal); let d = CS.num(c.gdisc); if (c.gdiscPct) d = sub * CS.num(c.gdiscPct) / 100; const lineDisc = CS.sum(c.lines, (l) => CS.num(l.qty) * CS.num(l.price) * CS.num(l.disc) / 100); const total = CS.round(sub - d); const kdv = CS.sum(c.lines, (l) => lineTotal(l) - lineTotal(l) / (1 + CS.num(l.kdv) / 100)) * (sub ? total / sub : 1); return { sub, disc: d + lineDisc, total, kdv, count: CS.sum(c.lines, (l) => CS.num(l.qty)) }; }

  function wh() { return CS.posWh || CS.defaultWh(); }

  function addProduct(p, qty = 1, price) {
    if (!p) return;
    if (p.variants && p.variants.length) return chooseVariant(p, qty);
    const c = C(); const list = c.list || 0;
    if (!p.service && !CS.db.settings.negativeStock && !c.ret && CS.stockOf(p, wh()) - qty < 0) { CS.toast(`${CS.productName(p)} için stok yetersiz (${CS.qty(CS.stockOf(p, wh()))}).`, 'bad'); return; }
    const gp = price ?? CS.grossPrice(p, list);
    const ex = c.lines.find((l) => l.pid === p.id && l.price === gp && !l.weighed);
    if (ex && price == null) ex.qty = CS.round(CS.num(ex.qty) + qty, 3); else c.lines.push({ pid: p.id, name: CS.productName(p), qty, price: gp, kdv: CS.num(p.kdv), disc: 0, unit: p.unit || 'Adet', weighed: price != null });
    selLine = c.lines.indexOf(ex || c.lines[c.lines.length - 1]);
    if (!p.service && CS.stockOf(p, wh()) - qty <= 0 && !c.ret) CS.toast(`${CS.productName(p)}: depoda stok kalmadı.`, 'warn');
    saveCarts(); drawCart(); beep();
  }
  function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(); const g = a.createGain(); o.frequency.value = 1400; g.gain.value = 0.04; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.06); setTimeout(() => a.close(), 200); } catch (e) { } }

  function chooseVariant(p, qty) {
    const vs = p.variants.map((id) => CS.product(id)).filter(Boolean);
    const m = CS.modal({ title: p.name + ' — varyant seçin', body: `<div class="pos-grid" style="padding:0">${vs.map((v) => `<button class="pos-item ${CS.stockOf(v, wh()) <= 0 ? 'out' : ''}" data-v="${v.id}"><b>${esc(Object.values(v.attrs || {}).join(' / '))}</b><small>Stok: ${CS.qty(CS.stockOf(v, wh()))}</small><span class="pr">${CS.fmt2(CS.grossPrice(v, C().list))}</span></button>`).join('')}</div>` });
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { m.close(); addProduct(CS.product(b.dataset.v), qty); } });
  }

  /** Barkod çözümleme: "3*8690..." çarpan, terazi barkodu (27/28/29 + 5 hane ürün + 5 hane gram/fiyat) */
  function handleCode(raw) {
    let s = String(raw).trim(); if (!s) return; let qty = 1;
    const m = s.match(/^(\d+(?:[.,]\d+)?)\s*[*xX]\s*(.+)$/); if (m) { qty = CS.num(m[1]); s = m[2].trim(); }
    let p = CS.findByBarcode(s);
    const sc = CS.db.settings.scale || { prefixes: '27,28,29', mode: 'weight', codeLen: 5 };
    if (!p && /^\d{13}$/.test(s) && sc.prefixes.split(',').map((x) => x.trim()).includes(s.slice(0, 2))) {
      const code = s.slice(2, 2 + CS.num(sc.codeLen || 5)); const val = CS.num(s.slice(2 + CS.num(sc.codeLen || 5), 12));
      p = CS.db.products.find((x) => x.scaleCode === code || x.scaleCode === String(+code) || x.code === code);
      if (p) { if (sc.mode === 'price') { const price = val / 100; const q = CS.round(price / CS.grossPrice(p, C().list), 3); addProduct(p, q); } else addProduct(p, CS.round(val / 1000, 3)); return; }
    }
    if (p) { addProduct(p, qty); return; }
    // isimle arama
    const found = CS.db.products.filter((x) => x.active !== false && !x.parentId && CS.match(x.name, s));
    if (found.length === 1) { addProduct(found[0], qty); return; }
    if (found.length > 1) { CS.pickProduct((pp) => addProduct(pp, qty), { wh: wh() }); setTimeout(() => { const q = $('#pq'); if (q) { q.value = s; q.dispatchEvent(new Event('input')); } }, 50); return; }
    notFound(s);
  }
  async function notFound(code) {
    const lib = (CS.LIBRARY || []).find((r) => r[0] === code);
    const pool = lib ? null : await CS.poolLookup(code);
    const libLike = lib || (pool ? [code, pool.name, pool.category, pool.unit, '', ''] : null);
    CS.modal({
      title: 'Ürün bulunamadı', size: 'sm', body: `<p><b>${esc(code)}</b> sizin ürünlerinizde kayıtlı değil.</p>${lib ? `<p class="alert info">Hazır ürün kütüphanesinde bulundu: <b>${esc(lib[1])}</b> (${CS.fmt2(lib[5])} ₺)</p>` : ''}${pool ? `<p class="alert info">Ortak barkod havuzunda bu barkod <b>${esc(pool.name)}</b> olarak tanımlı${pool.users > 1 ? ` (${pool.users} işletmede)` : ''}. Kendi fiyatınızla ürünlerinize ekleyebilirsiniz.</p>` : ''}`,
      buttons: [{ label: 'Satış kaybı olarak kaydet', onClick: () => { CS.db.lostSales.push({ id: CS.uid(), date: CS.today(), code, qty: 1, reason: 'Ürün tanımlı değil' }); CS.save(); CS.toast('Satış kaybı kaydedildi.'); } },
      { label: libLike ? 'Ürünlerime ekle ve sat' : 'Hızlı ürün ekle', kind: 'primary', onClick: () => { if (!CS.can('products', 'e')) { CS.toast('Ürün ekleme yetkiniz yok.', 'bad'); return; } CS.quickProduct({ barcode: code, name: libLike?.[1], buy: libLike?.[4] || '', sell: libLike?.[5] || '', unit: libLike?.[3], catName: libLike?.[2] }, (p) => addProduct(p)); } }]
    });
  }
  CS.quickProduct = function (d, cb) {
    const f = CS.form([{ k: 'name', l: 'Ürün adı', req: true, w: 'full' }, { k: 'barcode', l: 'Barkod' }, { k: 'unit', l: 'Birim', t: 'select', opts: CS.db.units }, ...(CS.canCost() ? [{ k: 'buy', l: 'Alış fiyatı (₺, KDV hariç)', t: 'money' }] : []), { k: 'sell', l: 'Satış fiyatı (KDV dahil)', t: 'money', req: true }, { k: 'kdv', l: 'KDV %', t: 'select', opts: CS.KDV_RATES.map(String) }, { k: 'stock', l: 'Açılış stoğu', t: 'number' }], { kdv: String(CS.db.settings.defaultKdv), unit: 'Adet', ...d });
    CS.modal({ title: 'Hızlı ürün ekle', body: f, buttons: [{ label: 'Vazgeç' }, { label: 'Kaydet', kind: 'primary', onClick: () => { const v = f.read(); if (!v) return false; let cat = ''; if (d.catName) { cat = CS.db.categories.find((c) => c.name === d.catName)?.id; if (!cat) { cat = 'cat_' + CS.uid(); CS.db.categories.push({ id: cat, name: d.catName }); } } const p = { id: 'p_' + CS.uid(), name: v.name, barcode: v.barcode, code: '', cat, unit: v.unit, buy: v.buy || 0, sell: v.sell, kdv: +v.kdv, critical: 0, active: true, stock: {} }; CS.db.products.push(p); if (v.stock) CS.addMove({ pid: p.id, wh: CS.defaultWh(), qty: v.stock, type: 'acilis', ref: 'open_' + p.id }); CS.log('Ürün eklendi', p.name); CS.save(); cb && cb(p); } }] });
  };

  /* ---------- Çizim ---------- */
  let root;
  function drawGrid() {
    const grid = $('.pos-grid', root); const q = CS.trLower($('#psearch', root)?.value || '');
    let ps = CS.db.products.filter((p) => p.active !== false && !p.parentId);
    if (q) ps = ps.filter((p) => CS.match(p.name + ' ' + p.barcode + ' ' + p.code, q)); else if (cat === '__quick') ps = ps.filter((p) => p.quick); else if (cat) ps = ps.filter((p) => p.cat === cat);
    ps = ps.slice(0, 200);
    grid.innerHTML = ps.map((p) => { const st = p.variants?.length ? CS.sum(p.variants, (v) => CS.stockOf(v, wh())) : CS.stockOf(p, wh()); return `<button class="pos-item ${!p.service && st <= 0 ? 'out' : ''}" data-p="${p.id}">${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}<b>${esc(p.name)}</b><small>${p.service ? 'Hizmet' : 'Stok ' + CS.qty(st) + ' ' + esc(p.unit || '')}${p.variants?.length ? ' · ' + p.variants.length + ' varyant' : ''}</small><span class="pr">${CS.fmt2(CS.grossPrice(p, C().list))}</span></button>`; }).join('') || `<p class="empty" style="grid-column:1/-1">${cat === '__quick' && !q ? 'Hızlı ürün yok. Ürün kartında “Hızlı satış ekranında göster” seçeneğini işaretleyin.' : 'Ürün bulunamadı.'}</p>`;
  }
  function drawCart() {
    const c = C(); const t = cartTotal(c); const cu = CS.contact(c.cid);
    $('.carts', root).innerHTML = carts.map((x, i) => `<button class="${i === cur ? 'on' : ''} ${x.lines.length ? 'has' : ''}" data-cart="${i}" title="Sepet ${i + 1} (Ctrl+${i + 1})">${i + 1}</button>`).join('') + `<span class="spacer"></span><button data-a="held" title="Bekletilen satışlar">${icon('pause', 16)}</button>`;
    $('.pos-cust', root).innerHTML = `<div class="who">${cu ? esc(cu.name) + `<small>${CS.balanceText(CS.balance(cu.id))} · ${esc(CS.db.settings.priceLists[c.list || 0] || '')} fiyatı</small>` : 'Perakende müşteri<small>Müşteri seçmek için F9</small>'}</div>${cu ? `<button class="icon-btn" data-a="nocust" aria-label="Müşteriyi kaldır">${icon('x')}</button>` : ''}<select id="plist" aria-label="Fiyat listesi" title="Satışta kullanılacak fiyat">${CS.db.settings.priceLists.map((n, i) => `<option value="${i}" ${i === (c.list || 0) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select><button class="btn sm" data-a="cust">${icon('users', 15)} Müşteri</button>`;
    $('.pos-lines', root).innerHTML = c.lines.length ? c.lines.map((l, i) => `<div class="pl ${i === selLine ? 'sel' : ''} ${c.ret ? 'ret' : ''}" data-l="${i}"><span class="n">${esc(l.name)}</span><span class="t">${CS.fmt2(lineTotal(l))}</span><span class="d"><span class="qbtn"><button data-q="-" aria-label="Azalt">−</button><b>${CS.qty(l.qty)}</b><button data-q="+" aria-label="Artır">+</button></span>${esc(l.unit)} × ${CS.fmt2(l.price)}${CS.num(l.disc) ? ` <span class="pill warn">%${CS.fmt2(l.disc)}</span>` : ''}</span><span class="d"><button class="icon-btn" data-ed aria-label="Satırı düzenle">${icon('edit', 15)}</button><button class="icon-btn danger" data-del aria-label="Satırı sil">${icon('trash', 15)}</button></span></div>`).join('') : `<p class="empty">${c.ret ? 'İade modu: iade edilecek ürünleri okutun.' : 'Barkod okutun ya da soldan ürün seçin.'}</p>`;
    $('.pos-sum', root).innerHTML = `<div><span>${CS.qty(t.count)} kalem ürün</span><span>Ara toplam ${CS.fmt2(t.sub)}</span></div>${t.disc ? `<div><span>İndirim</span><span class="neg">−${CS.fmt2(t.disc)}</span></div>` : ''}<div class="muted"><span>KDV dahil</span><span>KDV ${CS.fmt2(t.kdv)}</span></div><div class="pos-total"><span>${c.ret ? 'İADE TUTARI' : 'Toplam'}</span><b>${money(t.total)}</b></div>`;
    $$('.pos-tools [data-a=ret]', root).forEach((b) => b.classList.toggle('on', c.ret));
    const l = $('.pl.sel', root); l && l.scrollIntoView({ block: 'nearest' });
  }

  function editLine(i) {
    const c = C(); const l = c.lines[i]; if (!l) return;
    const canPrice = CS.can('pos', 'd') || CS.role()?.id === 'r_admin' || CS.can('products', 'e');
    const p = CS.product(l.pid);
    const f = CS.form([{ k: 'qty', l: 'Miktar', t: 'number', req: true }, { k: 'price', l: 'Birim fiyat (KDV dahil)', t: 'money', ro: !canPrice }, { k: 'disc', l: 'Satır indirimi %', t: 'number' }, { k: 'name', l: 'Açıklama', w: 'full' }], l);
    const box = document.createElement('div');
    if (p) box.innerHTML = `<p class="muted" style="margin:0 0 6px">Fiyat seç</p><div class="row" style="margin-bottom:12px">${CS.db.settings.priceLists.map((n, k) => { const v = k === 0 || CS.num(p.prices?.[k]) ? CS.grossPrice(p, k) : 0; return v ? `<button class="btn sm ${Math.abs(v - CS.num(l.price)) < 0.005 ? 'primary' : ''}" type="button" data-pl="${k}">${esc(n)}: ${CS.fmt2(v)}</button>` : ''; }).join('')}</div><p class="muted" style="margin:0 0 6px">Yüzde indirim</p><div class="row" style="margin-bottom:12px">${[0, 5, 10, 15, 20, 25].map((d) => `<button class="btn sm" type="button" data-dp="${d}">%${d}</button>`).join('')}</div>`;
    box.appendChild(f);
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-pl]'); if (b) { $('#f_price', f).value = CS.fmt2(CS.grossPrice(p, +b.dataset.pl)); box.querySelectorAll('[data-pl]').forEach((x) => x.classList.toggle('primary', x === b)); } const d = e.target.closest('[data-dp]'); if (d) $('#f_disc', f).value = d.dataset.dp; });
    CS.modal({ title: 'Satırı düzenle', size: 'sm', body: box, buttons: [{ label: 'Sil', kind: 'danger', onClick: () => { c.lines.splice(i, 1); saveCarts(); drawCart(); } }, { label: 'Kaydet', kind: 'primary', onClick: () => { const v = f.read(); if (!v) return false; if (!discOk(v.disc)) return false; Object.assign(l, v); if (!l.qty) c.lines.splice(i, 1); saveCarts(); drawCart(); } }] });
  }
  function chooseCustomer() {
    const m = CS.modal({ title: 'Müşteri seç', size: 'lg', body: `<div class="pick"><div class="row"><input id="cq" type="search" placeholder="Ad, telefon, vergi no" style="flex:1" autofocus><button class="btn" id="cnew">${icon('plus', 15)} Yeni müşteri</button></div><div class="pick-list" id="cl"></div></div>` });
    const draw = () => { const q = $('#cq', m.el).value; $('#cl', m.el).innerHTML = CS.db.contacts.filter((c) => !c.archived && c.kind !== 'tedarikci' && (!q || CS.match(c.name + ' ' + c.phone + ' ' + c.taxNo + ' ' + c.tc, q))).slice(0, 60).map((c) => `<button class="pick-row" data-c="${c.id}"><span><b>${esc(c.name)}</b><small>${esc(c.phone || '')} ${esc(c.category || '')}</small></span><span class="r">${CS.balanceLabel(CS.balance(c.id))}</span></button>`).join('') || '<p class="empty">Müşteri yok.</p>'; };
    $('#cq', m.el).oninput = draw; draw();
    $('#cl', m.el).onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; setCustomer(b.dataset.c); m.close(); };
    $('#cnew', m.el).onclick = () => { m.close(); CS.contactForm({ kind: 'musteri' }, (c) => setCustomer(c.id)); };
  }
  function setCustomer(id) {
    const c = C(); const cu = CS.contact(id); c.cid = id; const nl = cu ? CS.num(cu.priceList) : 0;
    if (nl !== (c.list || 0)) { c.list = nl; c.lines.forEach((l) => { const p = CS.product(l.pid); if (p && !l.weighed) l.price = CS.grossPrice(p, nl); }); }
    if (cu && CS.num(cu.discount)) c.gdiscPct = CS.num(cu.discount);
    saveCarts(); drawCart(); drawGrid();
  }
  /** Kullanıcının en fazla indirim yetkisi */
  function discOk(pct) { const max = CS.num(CS.user.maxDiscount); if (max && CS.num(pct) > max && CS.role()?.id !== 'r_admin') { CS.toast(`En fazla %${max} indirim yapabilirsiniz.`, 'bad'); return false; } return true; }
  function discount() {
    const c = C(); const t = cartTotal({ ...c, gdisc: 0, gdiscPct: 0 });
    const f = CS.form([{ k: 'gdiscPct', l: 'İndirim %', t: 'number' }, { k: 'gdisc', l: 'veya indirim tutarı (₺)', t: 'money' }, { k: 'scope', l: 'Uygula', t: 'select', opts: [['all', 'Sepet toplamına'], ['lines', 'Her satıra ayrı ayrı (satır indirimi)']] }], c);
    const box = document.createElement('div'); box.innerHTML = `<div class="row" style="margin-bottom:12px">${[5, 10, 15, 20, 25, 30, 50].map((d) => `<button class="btn" type="button" data-dp="${d}">%${d}</button>`).join('')}</div>`; box.appendChild(f);
    const info = document.createElement('p'); info.className = 'muted'; box.appendChild(info);
    const upd = () => { const pct = CS.num($('#f_gdiscPct', f).value), amt = CS.num($('#f_gdisc', f).value); const d = pct ? t.sub * pct / 100 : amt; info.textContent = `Sepet ${CS.money(t.sub)} → indirimli ${CS.money(t.sub - d)} (indirim ${CS.money(d)})`; };
    box.addEventListener('click', (e) => { const d = e.target.closest('[data-dp]'); if (d) { $('#f_gdiscPct', f).value = d.dataset.dp; $('#f_gdisc', f).value = ''; upd(); } }); f.addEventListener('input', upd); upd();
    CS.modal({ title: 'Yüzde indirim', size: 'sm', body: box, buttons: [{ label: 'İndirimi kaldır', onClick: () => { c.gdisc = 0; c.gdiscPct = 0; c.lines.forEach((l) => (l.disc = 0)); saveCarts(); drawCart(); } }, { label: 'Uygula', kind: 'primary', onClick: () => { const v = f.read(); const pct = CS.num(v.gdiscPct); if (!discOk(pct || (t.sub ? (CS.num(v.gdisc) / t.sub) * 100 : 0))) return false; if (v.scope === 'lines' && pct) { c.lines.forEach((l) => (l.disc = pct)); c.gdiscPct = 0; c.gdisc = 0; } else { c.gdiscPct = pct; c.gdisc = pct ? 0 : CS.num(v.gdisc); } saveCarts(); drawCart(); } }] });
  }
  function priceCheck() {
    const m = CS.modal({ title: 'Fiyat gör (yalnızca göster, satışa eklemez)', size: 'sm', body: '<input id="fc" placeholder="Barkod okutun" autofocus style="width:100%"><div id="fr" style="margin-top:12px"></div>' });
    $('#fc', m.el).onkeydown = async (e) => {
      if (e.key !== 'Enter') return; const code = e.target.value.trim(); const p = CS.findByBarcode(code); e.target.select();
      if (!p) { const pool = await CS.poolLookup(code); $('#fr', m.el).innerHTML = pool ? `<p class="alert info">Sizin ürünlerinizde yok. Ortak havuzda: <b>${esc(pool.name)}</b></p>` : '<p class="neg">Ürün bulunamadı.</p>'; return; }
      const cc = CS.canCost(); const fx = p.cur && p.cur !== '₺';
      $('#fr', m.el).innerHTML = `<h2 style="margin:0 0 8px">${esc(CS.productName(p))}</h2>${cc ? `<div class="big-due" style="background:var(--surface2);color:var(--ink)">Alış: ${money(p.buy)}${fx ? ` <small>(${CS.fxMoney(p.buyFx, p.cur)} × ${CS.fmt2(CS.rate(p.cur))})</small>` : ''}</div>` : ''}<div class="list">${CS.db.settings.priceLists.map((n, k) => { const v = k === 0 || CS.num(p.prices?.[k]) ? CS.grossPrice(p, k) : 0; return v ? `<div><span>${esc(n)}</span><b>${money(v)}${cc && CS.num(p.buy) ? ` <small class="muted">kâr %${CS.fmt2(CS.marginOf(p, k))}</small>` : ''}</b></div>` : ''; }).join('')}<div><span>Stok</span><b>${CS.qty(CS.stockOf(p, wh()))} ${esc(p.unit || '')} bu depoda · toplam ${CS.qty(CS.stockOf(p))}</b></div>${p.barcode ? `<div><span>Barkod</span><b>${esc(p.barcode)}</b></div>` : ''}${CS.byId('sources', p.sourceId) ? `<div><span>Alındığı yer</span><b>${esc(CS.byId('sources', p.sourceId).name)}</b></div>` : ''}</div><p><button class="btn sm" id="fcadd" type="button">Sepete ekle</button></p>`;
      $('#fcadd', m.el).onclick = () => { m.close(); addProduct(p); };
    };
  }

  /* ---------- Ödeme ---------- */
  function posAccounts() { const p = CS.accountsOf(['pos']); return p.length ? p : CS.accountsOf(['banka']); }
  function cashAccount() { const br = CS.branchId; const ks = CS.accountsOf(['kasa']); return (CS.posCashAcc && CS.account(CS.posCashAcc)) ? CS.posCashAcc : (ks.find((a) => a.branchId === br) || ks[0])?.id; }
  function pay(method) {
    const c = C(); if (!c.lines.length) { CS.toast('Sepet boş.', 'bad'); return; }
    const t = cartTotal(c);
    if (method === 'veresiye' && !c.cid) { CS.toast('Açık hesap satış için önce müşteri seçin (F9).', 'bad'); chooseCustomer(); return; }
    if (method === 'veresiye') { const cu = CS.contact(c.cid); if (CS.num(cu.limit) && CS.balance(cu.id) + t.total > CS.num(cu.limit)) { CS.confirm(`${cu.name} risk limitini (${money(cu.limit)}) aşıyor. Yine de açık hesaba yazılsın mı?`, () => finish([], 'veresiye'), 'Yine de yaz', 'primary'); return; } return finish([], 'veresiye'); }
    if (method === 'exact') return finish([{ accId: cashAccount(), amount: t.total, method: 'nakit' }], 'nakit');
    if (method === 'nakit') {
      const m = CS.modal({ title: c.ret ? 'Nakit iade' : 'Nakit ödeme', size: 'sm', body: `<div class="big-due">${money(t.total)}</div><label class="fld full"><span>Alınan tutar</span><input id="given" inputmode="decimal" value="${CS.fmt2(t.total)}" autofocus></label><div class="row" style="margin:8px 0">${[50, 100, 200, 500, 1000].map((v) => `<button class="btn sm" data-g="${v}">${v} ₺</button>`).join('')}</div><h2 id="chg" style="text-align:center">Para üstü: 0,00 ₺</h2>`, buttons: [{ label: 'Vazgeç' }, { label: 'Satışı tamamla (Enter)', kind: 'primary', onClick: () => finish([{ accId: cashAccount(), amount: t.total, method: 'nakit' }], 'nakit', CS.num($('#given', m.el).value)) }] });
      const g = $('#given', m.el); const upd = () => { const ch = CS.num(g.value) - t.total; $('#chg', m.el).textContent = 'Para üstü: ' + money(Math.max(0, ch)); };
      g.oninput = upd; g.onfocus = () => g.select(); g.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('footer .primary', m.el).click(); } };
      m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) { g.value = b.dataset.g; upd(); } });
      return;
    }
    if (method === 'kart') {
      const accs = posAccounts(); if (accs.length === 1) return finish([{ accId: accs[0].id, amount: t.total, method: 'kart' }], 'kart');
      const m = CS.modal({ title: 'Kartla ödeme', size: 'sm', body: `<div class="big-due">${money(t.total)}</div><label class="fld full"><span>POS cihazı / hesap</span><select id="pa">${accs.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label><label class="fld full"><span>Taksit</span><select id="ins"><option>Tek çekim</option>${[2, 3, 4, 6, 9, 12].map((n) => `<option>${n} taksit</option>`).join('')}</select></label>`, buttons: [{ label: 'Vazgeç' }, { label: 'Ödeme alındı', kind: 'primary', onClick: () => finish([{ accId: $('#pa', m.el).value, amount: t.total, method: 'kart', note: $('#ins', m.el).value }], 'kart') }] });
      return;
    }
    if (method === 'split') {
      const accs = CS.accountsOf(['kasa', 'banka', 'pos']);
      const rows = [['nakit', 'Nakit', cashAccount()], ['kart', 'Kredi kartı', posAccounts()[0]?.id], ['havale', 'Havale / EFT', CS.accountsOf(['banka'])[0]?.id], ['yemek', 'Yemek kartı', posAccounts()[0]?.id]];
      const m = CS.modal({
        title: 'Parçalı ödeme', body: `<div class="big-due">${money(t.total)}</div><div class="paysplit">${rows.map(([k, l, a]) => `<label><span>${l}</span><span class="row"><input data-amt="${k}" inputmode="decimal" placeholder="0,00" style="flex:1"><select data-acc="${k}" style="max-width:190px">${accs.map((x) => `<option value="${x.id}" ${x.id === a ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></span></label>`).join('')}<label><span>Açık hesap</span><b id="rest">${money(t.total)}</b></label></div><p class="muted">Kalan tutar ${c.cid ? 'müşterinin açık hesabına yazılır.' : 'için müşteri seçmelisiniz.'}</p>`,
        buttons: [{ label: 'Vazgeç' }, { label: 'Satışı tamamla', kind: 'primary', onClick: () => { const splits = rows.map(([k]) => ({ method: k, amount: CS.num($(`[data-amt=${k}]`, m.el).value), accId: $(`[data-acc=${k}]`, m.el).value })).filter((s) => s.amount > 0); const paid = CS.sum(splits, 'amount'); if (paid - t.total > 0.009) { CS.toast('Ödemeler toplamı satış tutarını aşıyor.', 'bad'); return false; } if (t.total - paid > 0.009 && !c.cid) { CS.toast('Kalan tutar için müşteri seçin ya da tutarları tamamlayın.', 'bad'); return false; } finish(splits, 'parcali'); } }]
      });
      m.el.addEventListener('input', () => { const paid = CS.sum($$('[data-amt]', m.el), (i) => CS.num(i.value)); $('#rest', m.el).textContent = money(Math.max(0, t.total - paid)); });
    }
  }

  function finish(splits, method, given) {
    const c = C(); const t = cartTotal(c);
    const lines = c.lines.map((l) => { const p = CS.product(l.pid); return { pid: l.pid, name: l.name, qty: CS.num(l.qty), unit: l.unit, price: CS.round(CS.num(l.price) / (1 + CS.num(l.kdv) / 100), 6), kdv: CS.num(l.kdv), disc: CS.num(l.disc), cost: CS.num(p?.buy) }; });
    const cu = CS.contact(c.cid);
    const doc = CS.postDoc({ type: c.ret ? 'pos_iade' : 'pos', date: CS.today(), cid: c.cid || '', wh: wh(), lines, gdisc: c.gdiscPct ? 0 : c.gdisc, gdiscPct: c.gdiscPct, currency: '₺', rate: 1, status: 'tamam', sellerId: c.sellerId || CS.user.id, payMethod: method, edoc: cu?.efatura ? 'efatura' : 'fis', note: c.note, branchId: CS.branchId || CS.user.branchId });
    splits.forEach((s) => CS.payment({ dir: c.ret ? 'out' : 'in', cid: c.cid || '', accId: s.accId, amount: s.amount, date: doc.date, desc: `${c.ret ? 'İade' : 'Satış'} ${({ nakit: 'nakit', kart: 'kart', havale: 'havale', yemek: 'yemek kartı' })[s.method] || ''} — ${doc.no}${s.note ? ' (' + s.note + ')' : ''}`, method: s.method, docId: doc.id }));
    // POS cihazından banka hesabına otomatik aktarım (valör) bilgisini tut
    CS.save();
    const change = given ? Math.max(0, given - t.total) : 0;
    carts[cur] = newCart(); selLine = -1; saveCarts(); drawCart(); drawGrid(); CS.refreshBadges();
    if (bc) try { bc.postMessage({ done: true, total: t.total, change, company: CS.db.company.name, footer: CS.db.settings.receiptFooter }); } catch (e) { }
    CS.toast(`${c.ret ? 'İade' : 'Satış'} tamamlandı: ${money(t.total)}${change ? ' · para üstü ' + money(change) : ''}`);
    if (CS.db.settings.autoPrint) CS.printReceipt(doc, given);
    else lastDoc = doc;
    $('#scan', root)?.focus();
  }
  let lastDoc = null;

  /** 58/80 mm fiş */
  CS.printReceipt = function (doc, given) {
    const co = CS.db.company; const t = CS.calcDoc(doc); const w = CS.db.settings.receiptWidth || 80; const cu = CS.contact(doc.cid); const pays = CS.db.accMoves.filter((m) => m.docId === doc.id);
    const html = `<div class="rc"><h1>${esc(co.title || co.name)}</h1><p>${esc(co.address)} ${esc(co.city)}<br>${co.phone ? 'Tel: ' + esc(co.phone) : ''}${co.taxNo ? '<br>VD: ' + esc(co.taxOffice) + ' VKN: ' + esc(co.taxNo) : ''}</p><p>${CS.DOC_TYPES[doc.type].label}<br>No: ${esc(doc.no)}<br>${CS.dateTime(doc.createdAt)}${cu ? '<br>Müşteri: ' + esc(cu.name) : ''}</p><table>${doc.lines.map((l) => { const c = CS.calcLine(l); return `<tr><td colspan="2">${esc(l.name)}</td></tr><tr><td>${CS.qty(l.qty)} ${esc(l.unit || '')} x ${CS.fmt2(CS.num(l.price) * (1 + l.kdv / 100))} ${l.disc ? '(-%' + l.disc + ')' : ''}</td><td class="r">${CS.fmt2(c.total)}</td></tr>`; }).join('')}</table><table>${t.gDisc ? `<tr><td>İndirim</td><td class="r">-${CS.fmt2(t.gDisc)}</td></tr>` : ''}${Object.entries(t.kdvBy).map(([k, v]) => `<tr><td>KDV %${k}</td><td class="r">${CS.fmt2(v)}</td></tr>`).join('')}<tr class="tt"><td>TOPLAM</td><td class="r">${CS.fmt2(t.total)}</td></tr>${pays.map((p) => `<tr><td>${esc((p.method || 'ödeme').toUpperCase())}</td><td class="r">${CS.fmt2(Math.abs(p.amt))}</td></tr>`).join('')}${given && given > t.total ? `<tr><td>Alınan</td><td class="r">${CS.fmt2(given)}</td></tr><tr><td>Para üstü</td><td class="r">${CS.fmt2(given - t.total)}</td></tr>` : ''}${!pays.length && doc.cid ? '<tr><td colspan="2">Açık hesaba yazıldı</td></tr>' : ''}</table><div class="bcw">${CS.barcodeSVG(doc.no, 34)}</div><p>${esc(CS.db.settings.receiptFooter || '')}</p><p class="s">Mali değeri yoktur. Bilgi fişidir.</p></div>`;
    CS.printHTML(html, doc.no, `body{margin:0;width:${w}mm;font:${w < 70 ? 10 : 11}px/1.35 monospace}.rc{padding:3mm}h1{font-size:14px;text-align:center}p{text-align:center;margin:4px 0}table{margin:4px 0;border-top:1px dashed #000}td{border:0;padding:1px 0}.tt td{font-weight:700;font-size:14px;border-top:1px dashed #000}.bcw svg{width:100%;height:40px}.s{font-size:9px}@page{size:${w}mm auto;margin:0}`);
  };

  /* ---------- Bekletme ---------- */
  function hold() { const c = C(); if (!c.lines.length) return; CS.db.held.push({ id: CS.uid(), at: CS.now(), userId: CS.user.id, cart: c, total: cartTotal(c).total, name: CS.contactName(c.cid) || 'Perakende' }); carts[cur] = newCart(); CS.save(); saveCarts(); drawCart(); CS.toast('Satış bekletmeye alındı.'); }
  function showHeld() {
    const list = CS.db.held;
    const m = CS.modal({ title: 'Bekletilen satışlar', body: list.length ? `<div class="list">${list.map((h) => `<div><span>${CS.dateTime(h.at)} · ${esc(h.name)} · ${h.cart.lines.length} kalem · <b>${money(h.total)}</b></span><span><button class="btn sm" data-h="${h.id}">Sepete al</button> <button class="icon-btn danger" data-hd="${h.id}" aria-label="Sil">${icon('trash', 15)}</button></span></div>`).join('')}</div>` : '<p class="empty">Bekletilen satış yok.</p>' });
    m.el.addEventListener('click', (e) => { const a = e.target.closest('[data-h]'), d = e.target.closest('[data-hd]'); if (a) { const h = list.find((x) => x.id === a.dataset.h); let i = carts.findIndex((x) => !x.lines.length); if (i < 0) i = cur; carts[i] = h.cart; cur = i; CS.db.held = list.filter((x) => x !== h); CS.save(); saveCarts(); drawCart(); m.close(); } if (d) { CS.db.held = list.filter((x) => x.id !== d.dataset.hd); CS.save(); m.close(); showHeld(); } });
  }

  /* ---------- Kasa açılış / gün sonu (Z raporu) ---------- */
  function openSession() { return CS.db.sessions.find((s) => !s.closeAt && s.userId === CS.user.id); }
  function sessionDialog() {
    const s = openSession(); const acc = cashAccount();
    if (!s) {
      const f = CS.form([{ k: 'opening', l: 'Kasadaki açılış nakdi (₺)', t: 'money', def: CS.accBalance(acc) }]);
      CS.modal({ title: 'Kasa açılışı', size: 'sm', body: f, buttons: [{ label: 'Vazgeç' }, { label: 'Kasayı aç', kind: 'primary', onClick: () => { const v = f.read(); CS.db.sessions.push({ id: CS.uid(), userId: CS.user.id, accId: acc, openAt: CS.now(), opening: v.opening, branchId: CS.branchId }); CS.log('Kasa açıldı', money(v.opening)); CS.save(); drawSession(); } }] });
      return;
    }
    const moves = CS.db.accMoves.filter((m) => m.at >= s.openAt && m.userId === CS.user.id);
    const docs = CS.db.docs.filter((d) => ['pos', 'pos_iade'].includes(d.type) && d.createdAt >= s.openAt && d.userId === CS.user.id);
    const by = (k) => CS.sum(moves.filter((m) => m.method === k), 'amt');
    const cashIn = CS.sum(moves.filter((m) => m.accId === s.accId), 'amt'); const expected = CS.round(CS.num(s.opening) + cashIn);
    const sales = CS.sum(docs.filter((d) => d.type === 'pos'), 'total'), rets = CS.sum(docs.filter((d) => d.type === 'pos_iade'), 'total');
    const veresiye = CS.sum(docs.filter((d) => d.type === 'pos'), (d) => d.total - CS.docPaid(d));
    const f = CS.form([{ k: 'counted', l: 'Sayılan nakit (₺)', t: 'money', req: true }, { k: 'note', l: 'Not', w: 'full' }]);
    const info = document.createElement('div');
    info.innerHTML = `<div class="list"><div><span>Açılış</span><b>${CS.dateTime(s.openAt)}</b></div><div><span>Fiş sayısı</span><b>${docs.length}</b></div><div><span>Satış toplamı</span><b>${money(sales)}</b></div><div><span>İadeler</span><b class="neg">${money(rets)}</b></div><div><span>Nakit</span><b>${money(by('nakit'))}</b></div><div><span>Kredi kartı</span><b>${money(by('kart'))}</b></div><div><span>Havale</span><b>${money(by('havale'))}</b></div><div><span>Yemek kartı</span><b>${money(by('yemek'))}</b></div><div><span>Açık hesap (veresiye)</span><b>${money(veresiye)}</b></div><div><span>Açılış nakdi</span><b>${money(s.opening)}</b></div><div><span>Kasada olması gereken</span><b>${money(expected)}</b></div></div><hr>`; info.appendChild(f);
    CS.modal({ title: 'Gün sonu (Z raporu)', body: info, buttons: [{ label: 'Vazgeç' }, { label: 'X raporu yazdır', onClick: () => { printZ(s, docs, moves, expected, null); return false; } }, { label: 'Kasayı kapat', kind: 'primary', onClick: () => { const v = f.read(); if (!v) return false; Object.assign(s, { closeAt: CS.now(), counted: v.counted, expected, diff: CS.round(v.counted - expected), note: v.note, sales, rets }); if (Math.abs(s.diff) > 0.009) CS.addAccMove({ accId: s.accId, amt: s.diff, desc: `Kasa ${s.diff > 0 ? 'fazlası' : 'açığı'} — gün sonu`, kind: 'sayim', ref: s.id }); CS.log('Kasa kapatıldı', `Fark ${money(s.diff)}`); CS.save(); printZ(s, docs, moves, expected, v.counted); drawSession(); } }] });
  }
  function printZ(s, docs, moves, expected, counted) {
    const by = CS.groupBy(moves, (m) => m.method || m.kind || 'diğer');
    CS.printHTML(`<h1>${counted == null ? 'X' : 'Z'} raporu</h1><p>${esc(CS.db.company.name)} · ${esc(CS.user.name)}<br>${CS.dateTime(s.openAt)} – ${CS.dateTime(s.closeAt || CS.now())}</p><table><tr><th>Ödeme tipi</th><th class="r">Tutar</th></tr>${Object.entries(by).map(([k, L]) => `<tr><td>${esc(k)}</td><td class="r">${CS.fmt2(CS.sum(L, 'amt'))}</td></tr>`).join('')}</table><table><tr><td>Fiş adedi</td><td class="r">${docs.length}</td></tr><tr><td>Satış</td><td class="r">${CS.fmt2(CS.sum(docs.filter((d) => d.type === 'pos'), 'total'))}</td></tr><tr><td>İade</td><td class="r">${CS.fmt2(CS.sum(docs.filter((d) => d.type === 'pos_iade'), 'total'))}</td></tr><tr><td>Açılış nakdi</td><td class="r">${CS.fmt2(s.opening)}</td></tr><tr><td>Beklenen nakit</td><td class="r">${CS.fmt2(expected)}</td></tr>${counted != null ? `<tr><td>Sayılan</td><td class="r">${CS.fmt2(counted)}</td></tr><tr class="tot"><td>Fark</td><td class="r">${CS.fmt2(counted - expected)}</td></tr>` : ''}</table>`, 'Z raporu', 'body{width:80mm}');
  }
  function drawSession() { const s = openSession(); const b = $('[data-a=sess]', root); if (b) b.textContent = s ? 'Gün sonu' : 'Kasa aç'; }

  function cashInOut() {
    const f = CS.form([{ k: 'dir', l: 'İşlem', t: 'select', opts: [['out', 'Kasadan para çıkışı (masraf, bankaya yatırma)'], ['in', 'Kasaya para girişi']], w: 'full' }, { k: 'amount', l: 'Tutar', t: 'money', req: true }, { k: 'category', l: 'Kategori', t: 'select', opts: CS.db.expenseCats }, { k: 'desc', l: 'Açıklama', w: 'full' }]);
    CS.modal({ title: 'Kasa giriş / çıkış', size: 'sm', body: f, buttons: [{ label: 'Vazgeç' }, { label: 'Kaydet', kind: 'primary', onClick: () => { const v = f.read(); if (!v) return false; CS.addAccMove({ accId: cashAccount(), amt: v.dir === 'in' ? v.amount : -v.amount, desc: v.desc || (v.dir === 'in' ? 'Kasa girişi' : 'Kasa çıkışı'), kind: v.dir === 'in' ? 'gelir' : 'gider', category: v.category, method: v.dir === 'in' ? 'kasa_giris' : 'kasa_cikis' }); CS.log('Kasa hareketi', money(v.amount)); CS.save(); CS.toast('Kaydedildi.'); } }] });
  }
  function settingsDialog() {
    const f = CS.form([{ k: 'wh', l: 'Satış deposu', t: 'select', opts: CS.whOptions() }, { k: 'cash', l: 'Nakit kasası', t: 'select', opts: CS.accOptions(['kasa']) }, { k: 'seller', l: 'Satış personeli', t: 'select', opts: CS.db.users.filter((u) => u.active !== false).map((u) => [u.id, u.name]) }, { k: 'autoPrint', l: 'Satış sonrası fişi otomatik yazdır', t: 'check' }, { k: 'width', l: 'Fiş genişliği', t: 'select', opts: [['80', '80 mm'], ['58', '58 mm']] }], { wh: wh(), cash: cashAccount(), seller: C().sellerId, autoPrint: CS.db.settings.autoPrint, width: String(CS.db.settings.receiptWidth) });
    CS.modal({ title: 'Satış ekranı ayarları', size: 'sm', body: f, buttons: [{ label: 'Vazgeç' }, { label: 'Kaydet', kind: 'primary', onClick: () => { const v = f.read(); CS.posWh = v.wh; CS.posCashAcc = v.cash; C().sellerId = v.seller; CS.db.settings.autoPrint = v.autoPrint; CS.db.settings.receiptWidth = +v.width; CS.save(); saveCarts(); drawGrid(); CS.toast('Satış ekranı ayarları kaydedildi.'); } }] });
  }
  function help() {
    CS.modal({ title: 'Klavye kısayolları', size: 'sm', body: `<div class="list">${[['F2', 'Barkod alanına git'], ['F3', 'Fiyat gör'], ['F4', 'Nakit ödeme'], ['F5', 'Kartla ödeme'], ['F6', 'Açık hesap (veresiye)'], ['F7', 'Parçalı ödeme'], ['F8', 'İade modu'], ['F9', 'Müşteri seç'], ['F10', 'Genel indirim'], ['F12', 'Tam nakit, hızlı kapat'], ['Ctrl + 1…8', 'Sepet değiştir'], ['+ / −', 'Seçili satır miktarı'], ['Delete', 'Seçili satırı sil'], ['↑ / ↓', 'Satır seç'], ['3*barkod', 'Çarpanla ekle'], ['Esc', 'Sepeti temizle']].map(([k, l]) => `<div><kbd>${k}</kbd><span>${l}</span></div>`).join('')}</div>` });
  }

  function onKey(e) {
    if (!root || !document.body.contains(root)) { document.removeEventListener('keydown', onKey); return; }
    if ($('.modal-wrap')) return;
    const c = C(); const k = e.key; const inInput = e.target.matches('input,textarea,select') && e.target.id !== 'scan';
    const map = { F2: () => $('#scan', root).focus(), F3: priceCheck, F4: () => pay('nakit'), F5: () => pay('kart'), F6: () => pay('veresiye'), F7: () => pay('split'), F8: () => { c.ret = !c.ret; saveCarts(); drawCart(); }, F9: chooseCustomer, F10: discount, F12: () => pay('exact'), F1: help };
    if (map[k]) { e.preventDefault(); map[k](); return; }
    if (e.ctrlKey && /^[1-8]$/.test(k)) { e.preventDefault(); cur = +k - 1; selLine = -1; drawCart(); drawGrid(); return; }
    if (inInput) return;
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); selLine = Math.max(0, Math.min(c.lines.length - 1, selLine + (k === 'ArrowDown' ? 1 : -1))); drawCart(); return; }
    const l = c.lines[selLine]; const scanEmpty = !$('#scan', root).value;
    if (l && (k === '+' || k === '-') && scanEmpty) { e.preventDefault(); l.qty = CS.round(CS.num(l.qty) + (k === '+' ? 1 : -1), 3); if (l.qty <= 0) c.lines.splice(selLine, 1); saveCarts(); drawCart(); return; }
    if (l && k === 'Delete') { c.lines.splice(selLine, 1); selLine = Math.min(selLine, c.lines.length - 1); saveCarts(); drawCart(); return; }
    if (k === 'Escape' && c.lines.length && scanEmpty) { CS.confirm('Sepet temizlensin mi?', () => { carts[cur] = newCart(); saveCarts(); drawCart(); }, 'Temizle'); }
  }

  CS.mod('pos', {
    title: 'Hızlı satış', cls: 'pos-page',
    render(page, params) {
      root = page; loadCarts();
      if (CS.posDraft) { const i = carts.findIndex((x) => !x.lines.length); cur = i < 0 ? cur : i; Object.assign(carts[cur], CS.posDraft); CS.posDraft = null; saveCarts(); }
      const cats = CS.db.categories.filter((c) => CS.db.products.some((p) => p.cat === c.id && !p.parentId));
      page.innerHTML = `<div class="pos-wrap">
        <section class="pos-left">
          <div class="pos-bar"><div class="scan">${icon('barcode')}<input id="scan" placeholder="Barkod okutun ya da ürün adı yazın (F2)" autocomplete="off" aria-label="Barkod"></div>
            <button class="btn" data-a="cam" title="Kamerayla okut">${icon('cam')}</button>
            <input id="psearch" type="search" placeholder="Listede ara" style="width:150px" aria-label="Ürün listesinde ara">
            <select id="pwh" aria-label="Depo" title="Satış deposu">${CS.whOptions().map(([v, l]) => `<option value="${v}" ${v === wh() ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div class="pos-cats"><button data-cat="__quick" class="${cat === '__quick' ? 'on' : ''}">Hızlı ürünler</button><button data-cat="" class="${cat === '' ? 'on' : ''}">Tümü</button>${cats.map((c) => `<button data-cat="${c.id}" class="${cat === c.id ? 'on' : ''}">${esc(c.name)}</button>`).join('')}</div>
          <div class="pos-grid"></div>
        </section>
        <section class="pos-right">
          <div class="carts"></div><div class="pos-cust"></div><div class="pos-lines" aria-live="polite"></div><div class="pos-sum"></div>
          <div class="pos-pay"><button class="cash" data-a="nakit">Nakit<small>F4</small></button><button class="card" data-a="kart">Kart<small>F5</small></button><button data-a="veresiye">Açık hesap<small>F6</small></button><button data-a="split">Parçalı<small>F7</small></button></div>
          <div class="pos-tools"><button data-a="ret">İade<br></button><button data-a="disc">% İndirim</button><button data-a="hold">Beklet</button><button data-a="clear">Temizle</button><button data-a="last">Son fiş</button><button data-a="price">Fiyat gör</button><button data-a="cash">Kasa gir/çık</button><button data-a="sess">Kasa aç</button><button data-a="disp">Müşteri ekranı</button><button data-a="note">Not</button><button data-a="set">Ayarlar</button><button data-a="help">Kısayollar</button></div>
        </section></div>`;
      drawGrid(); drawCart(); drawSession(); broadcast();
      const scan = $('#scan', page);
      scan.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleCode(scan.value); scan.value = ''; } });
      $('#psearch', page).addEventListener('input', CS.debounce(drawGrid, 120));
      page.addEventListener('change', (e) => { if (e.target.id !== 'plist') return; const c = C(); c.list = +e.target.value; c.lines.forEach((l) => { const p = CS.product(l.pid); if (p && !l.weighed) l.price = CS.grossPrice(p, c.list); }); saveCarts(); drawCart(); drawGrid(); CS.toast(CS.db.settings.priceLists[c.list] + ' fiyatları uygulandı.'); });
      $('#pwh', page).onchange = (e) => { CS.posWh = e.target.value; drawGrid(); };
      page.addEventListener('click', (e) => {
        const t = e.target;
        const ci = t.closest('[data-cat]'); if (ci) { cat = ci.dataset.cat; $$('.pos-cats button', page).forEach((b) => b.classList.toggle('on', b === ci)); drawGrid(); return; }
        const pi = t.closest('[data-p]'); if (pi) { addProduct(CS.product(pi.dataset.p)); return; }
        const ca = t.closest('[data-cart]'); if (ca) { cur = +ca.dataset.cart; selLine = -1; drawCart(); drawGrid(); broadcast(); return; }
        const pl = t.closest('[data-l]');
        if (pl) { const i = +pl.dataset.l; const c = C(); const l = c.lines[i]; if (t.closest('[data-q]')) { l.qty = CS.round(CS.num(l.qty) + (t.closest('[data-q]').dataset.q === '+' ? 1 : -1), 3); if (l.qty <= 0) c.lines.splice(i, 1); saveCarts(); drawCart(); return; } if (t.closest('[data-del]')) { c.lines.splice(i, 1); saveCarts(); drawCart(); return; } if (t.closest('[data-ed]')) { editLine(i); return; } selLine = i; drawCart(); return; }
      });
      CS.bind(page, {
        nakit: () => pay('nakit'), kart: () => pay('kart'), veresiye: () => pay('veresiye'), split: () => pay('split'),
        ret: () => { C().ret = !C().ret; saveCarts(); drawCart(); }, disc: discount, hold, held: showHeld,
        clear: () => C().lines.length && CS.confirm('Sepet temizlensin mi?', () => { carts[cur] = newCart(); saveCarts(); drawCart(); }, 'Temizle'),
        last: () => { const d = lastDoc || CS.db.docs.filter((x) => ['pos', 'pos_iade'].includes(x.type)).slice(-1)[0]; d ? CS.printReceipt(d) : CS.toast('Henüz fiş yok.', 'bad'); },
        price: priceCheck, cash: cashInOut, sess: sessionDialog, set: settingsDialog, help,
        disp: () => window.open('display.html', 'cepstok-display', 'width=900,height=600'),
        cust: chooseCustomer, nocust: () => { C().cid = ''; C().list = 0; C().gdiscPct = 0; C().lines.forEach((l) => { const p = CS.product(l.pid); if (p && !l.weighed) l.price = CS.grossPrice(p, 0); }); saveCarts(); drawCart(); drawGrid(); },
        cam: () => CS.scan(handleCode),
        note: () => CS.prompt('Satış notu', 'Not (fişte görünür)', C().note, (v) => { C().note = v; saveCarts(); })
      });
      document.removeEventListener('keydown', onKey); document.addEventListener('keydown', onKey);
      setTimeout(() => scan.focus(), 50);
    }
  });
})();
