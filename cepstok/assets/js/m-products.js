/* Ürünler: kart, varyant, reçete, kategori/marka/birim, toplu içe-dışa aktarım, toplu fiyat, etiket */
(function () {
  const { $, $$, esc, money, icon } = CS;
  const TABS = [['list', 'Ürün listesi', 'products'], ['cats', 'Kategoriler', 'products/cats'], ['brands', 'Marka ve birim', 'products/brands'], ['bulk', 'Toplu işlemler', 'products/bulk'], ['labels', 'Etiket ve barkod', 'products/labels'], ['prices', 'Fiyat geçmişi', 'products/prices'], ['costs', 'Maliyet değişimleri', 'products/costs'], ['sources', 'Alındığı yerler', 'products/sources']];

  CS.mod('products', {
    title: 'Ürünler',
    render(page, prm) {
      const sub = prm._[0] || 'list';
      if (sub && !TABS.find((t) => t[0] === sub)) return detail(page, sub);
      const acts = CS.can('products', 'e') ? CS.btn('Yeni ürün', 'new', 'primary', 'plus') + CS.btn('Hazır üründen ekle', 'lib', '', 'barcode') : '';
      const body = CS.head(page, 'Ürünler', acts, CS.canCost() ? TABS : TABS.filter((t) => t[0] !== 'costs'), sub);
      CS.bind(page, { new: () => productForm(), lib: libraryDialog });
      ({ list, cats, brands, bulk, labels, prices, costs, sources })[sub](body, prm);
    }
  });

  /* ---------- Liste ---------- */
  function list(body, prm) {
    const f = { cat: prm.cat || '', state: prm.state || 'active', src: prm.src || '' };
    body.innerHTML = `<div id="pt"></div>`;
    const rows = () => CS.db.products.filter((p) => !p.parentId || f.state === 'variants').filter((p) => (!f.src || p.sourceId === f.src) && (!f.cat || p.cat === f.cat) && (f.state === 'all' || (f.state === 'active' && p.active !== false) || (f.state === 'passive' && p.active === false) || (f.state === 'critical' && (CS.isCritical(p) || (p.variants || []).some((v) => CS.isCritical(CS.product(v))))) || (f.state === 'nostock' && !p.service && CS.stockOf(p) <= 0 && !(p.variants || []).length) || (f.state === 'variants' && p.parentId)));
    const stockOfAny = (p) => (p.variants?.length ? CS.sum(p.variants, (v) => CS.stockOf(v)) : p.service ? 0 : CS.stockOf(p));
    const tbl = CS.table($('#pt', body), {
      rows: rows(), ph: 'Ad, barkod, stok kodu…',
      tools: `<select id="fc" aria-label="Kategori"><option value="">Tüm kategoriler</option>${CS.db.categories.map((c) => `<option value="${c.id}" ${c.id === f.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><select id="fs" aria-label="Durum">${[['active', 'Aktif ürünler'], ['all', 'Tümü'], ['passive', 'Pasif'], ['critical', 'Kritik stok'], ['nostock', 'Stoksuz'], ['variants', 'Varyantlar']].map(([v, l]) => `<option value="${v}" ${v === f.state ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn" id="pexp">${icon('down', 16)} Excel</button>`,
      searchText: (p) => [p.name, p.barcode, p.code, (p.barcodes || []).join(' '), Object.values(p.attrs || {}).join(' '), CS.categoryName(p.cat)].join(' '),
      cols: [
        { l: 'Ürün', v: (p) => CS.productName(p), f: (p) => `<b>${esc(CS.productName(p))}</b>${p.variants?.length ? ` <span class="pill info">${p.variants.length} varyant</span>` : ''}${p.recipe?.length ? ' <span class="pill">Reçeteli</span>' : ''}${p.service ? ' <span class="pill">Hizmet</span>' : ''}${p.active === false ? ' <span class="pill">Pasif</span>' : ''}<small>${esc(p.barcode || '')} ${p.code ? '· ' + esc(p.code) : ''}</small>` },
        { l: 'Kategori', v: (p) => CS.categoryName(p.cat) },
        { l: 'Stok', a: 'r', v: stockOfAny, f: (p) => p.service ? '—' : `<span class="${CS.isCritical(p) ? 'neg' : ''}">${CS.qty(stockOfAny(p))}</span> <small>${esc(p.unit || '')}</small>` },
        ...(CS.canCost() ? [{ l: 'Alış', a: 'r', v: (p) => CS.num(p.buy), f: (p) => (p.cur && p.cur !== '₺' ? `${CS.fmt2(p.buy)}<small>${CS.fxMoney(p.buyFx, p.cur)}</small>` : CS.fmt2(p.buy)) }] : []),
        { l: 'Satış', a: 'r', v: (p) => CS.num(p.sell), f: (p) => `<b>${CS.fmt2(p.sell)}</b>` },
        ...(CS.canCost() ? [{ l: 'Kâr %', a: 'r', v: (p) => margin(p), f: (p) => (p.buy ? `<span class="${margin(p) < 0 ? 'neg' : ''}">%${CS.fmt2(margin(p))}</span>${p.autoPrice ? '<small>otomatik</small>' : ''}` : '—') }] : []),
        ...CS.db.settings.priceLists.slice(1, 4).map((n, i) => ({ l: n, a: 'r', v: (p) => CS.num(p.prices?.[i + 1]), f: (p) => (CS.num(p.prices?.[i + 1]) ? CS.fmt2(p.prices[i + 1]) : '<span class="muted">—</span>') }))
      ],
      rowClass: (p) => (CS.isCritical(p) ? 'warn' : p.active === false ? 'dim' : ''),
      onRow: (p) => CS.go('products/' + p.id),
      actions: (p) => (CS.can('products', 'e') ? CS.actBtn('edit', 'Düzenle', 'edit') + CS.actBtn('copy', 'Kopyala', 'copy') : '') + CS.actBtn('label', 'Etiket', 'tag') + (CS.can('products', 'd') ? CS.actBtn('del', 'Sil', 'trash', 'danger') : ''),
      onAct: (a, p) => { if (a === 'edit') productForm(p); if (a === 'copy') { const c = JSON.parse(JSON.stringify(p)); delete c.id; c.name += ' (kopya)'; c.barcode = ''; c.variants = []; productForm(c); } if (a === 'label') labelDialog([{ pid: p.id, qty: 1 }]); if (a === 'del') deleteProduct(p); },
      foot: (rs) => `<tr><td colspan="2">Toplam ${rs.length} ürün</td><td class="r">${CS.qty(CS.sum(rs, stockOfAny))}</td><td class="r" colspan="${CS.canCost() ? 3 : 1}">${CS.canCost() ? 'Stok maliyeti ' + money(CS.sum(rs, (p) => Math.max(0, stockOfAny(p)) * CS.num(p.buy))) : ''}</td><td colspan="${CS.db.settings.priceLists.slice(1, 4).length + 1}"></td></tr>`
    });
    $('#fc', body).onchange = (e) => { f.cat = e.target.value; tbl.redraw(rows()); };
    $('#fs', body).onchange = (e) => { f.state = e.target.value; tbl.redraw(rows()); };
    $('#pexp', body).onclick = () => exportProducts(tbl.rows());
  }
  const margin = (p) => (CS.num(p.buy) ? ((CS.netPrice(p) - CS.num(p.buy)) / CS.num(p.buy)) * 100 : 0);

  function deleteProduct(p) {
    const used = CS.db.moves.some((m) => m.pid === p.id || (p.variants || []).includes(m.pid)) || CS.db.docs.some((d) => d.lines.some((l) => l.pid === p.id));
    if (used) { CS.confirm(`${p.name} hareket görmüş. Silmek yerine pasife alınsın mı? (Raporlar bozulmaz)`, () => { p.active = false; (p.variants || []).forEach((v) => (CS.product(v).active = false)); CS.log('Ürün pasife alındı', p.name); CS.save(); CS.route(); }, 'Pasife al', 'primary'); return; }
    CS.confirm(`${p.name} silinsin mi?`, () => { const ids = new Set([p.id, ...(p.variants || [])]); CS.db.products = CS.db.products.filter((x) => !ids.has(x.id)); CS.log('Ürün silindi', p.name); CS.save(); CS.go('products'); });
  }

  /* ---------- Ürün kartı formu ---------- */
  function productForm(p0, onSaved) {
    const isNew = !p0 || !p0.id; const p = p0 ? JSON.parse(JSON.stringify(p0)) : { active: true, kdv: CS.db.settings.defaultKdv, unit: 'Adet', prices: [] };
    const pl = CS.db.settings.priceLists; const cc = CS.canCost(); const cur0 = p.cur || '₺'; const fx0 = cur0 !== '₺';
    const locked = !cc && (fx0 || p.autoPrice); // maliyeti görmeyen kullanıcı kur/marj ile hesaplanan fiyatı değiştiremez
    const dl = [1, 2, 3].map((i) => pl[i] || 'Bayi ' + i);
    const fields = [
      { t: 'sep', l: 'Genel bilgiler' },
      { k: 'name', l: 'Ürün adı', req: true, w: 'full' },
      { k: 'barcode', l: 'Barkod', w: 'third', help: 'Okutun ya da “Barkod üret” deyin. Ortak havuzda kayıtlı barkodlarda ürün adı otomatik gelir.' }, { k: 'barcodes', l: 'Ek barkodlar (virgülle)', w: 'third' }, { k: 'code', l: 'Stok kodu', w: 'third' },
      { k: 'cat', l: 'Kategori', t: 'select', opts: [['', '— Kategori —']].concat(CS.db.categories.map((c) => [c.id, (c.parent ? CS.categoryName(c.parent) + ' › ' : '') + c.name])), w: 'third' },
      { k: 'brand', l: 'Marka', t: 'select', opts: [['', '— Marka —']].concat(CS.db.brands.map((b) => [b.id, b.name])), w: 'third' },
      { k: 'unit', l: 'Birim', t: 'select', opts: CS.db.units, w: 'third' },
      { k: 'sourceId', l: 'Alındığı yer', t: 'select', opts: [['', '— Seçin —']].concat((CS.db.sources || []).map((x) => [x.id, x.name + (x.code ? ' (' + x.code + ')' : '')])), w: 'third', help: 'Barkod üretiminde yerin kodu kullanılır; etiketleri yere göre basabilirsiniz.' },
      { k: 'supplierId', l: 'Ana tedarikçi', t: 'select', opts: CS.contactOptions('tedarikci', '— Tedarikçi —'), w: 'third' }, { k: 'shelf', l: 'Raf / reyon yeri', w: 'third' },
      { t: 'sep', l: 'Fiyat, döviz ve kâr' },
      { k: 'cur', l: 'Fiyat para birimi', t: 'select', opts: CS.FX.map((c) => [c, c === '₺' ? 'Türk lirası (₺)' : c]), w: 'third' },
      ...(cc ? [{ k: 'buyIn', l: 'Alış fiyatı (KDV hariç)', t: 'money', w: 'third' }] : []),
      { k: 'kdv', l: 'KDV %', t: 'select', opts: CS.KDV_RATES.map(String), w: 'third' },
      ...(cc ? [{ k: 'margin', l: 'Perakende kâr marjı %', t: 'number', w: 'third' }, { k: 'autoPrice', l: 'Satış fiyatlarını kâr marjından otomatik hesapla (kur değişince güncellenir)', t: 'check', w: 'full' }] : []),
      { k: 'sellIn', l: `${pl[0]} satış fiyatı (${CS.db.settings.priceIncludesKdv ? 'KDV dahil' : 'KDV hariç'})`, t: 'money', req: !p.autoPrice, w: 'third', ro: locked },
      ...dl.flatMap((n, i) => (cc ? [{ k: 'dm' + i, l: n + ' kâr marjı %', t: 'number', w: 'sixth' }] : []).concat([{ k: 'dp' + i, l: n + ' satış fiyatı', t: 'money', w: cc ? 'sixth' : 'third', ro: locked }])),
      { k: 'otv', l: 'ÖTV %', t: 'number', w: 'third' },
      { t: 'sep', l: 'Stok' },
      { k: 'critical', l: 'Kritik stok seviyesi', t: 'number', w: 'third' }, { k: 'maxStock', l: 'Azami stok', t: 'number', w: 'third' }, { k: 'scaleCode', l: 'Terazi PLU kodu', w: 'third', help: 'Tartılı ürünlerde terazi barkodundaki ürün kodu' },
      ...(isNew ? [{ k: 'openStock', l: 'Açılış stoğu', t: 'number', w: 'third' }, { k: 'openWh', l: 'Açılış deposu', t: 'select', opts: CS.whOptions(), w: 'third' }] : []),
      { k: 'service', l: 'Hizmet / stoksuz ürün', t: 'check', w: 'third' }, { k: 'quick', l: 'Hızlı satış ekranında göster', t: 'check', w: 'third' }, { k: 'active', l: 'Aktif', t: 'check', w: 'third' },
      { k: 'online', l: 'B2B katalogda ve e-ticarette yayınla', t: 'check', w: 'third' },
      { t: 'sep', l: 'Açıklama ve görsel' },
      { k: 'desc', l: 'Açıklama', t: 'textarea', w: 'full' }
    ];
    const data = Object.assign({}, p, { barcodes: (p.barcodes || []).join(', '), kdv: String(p.kdv ?? CS.db.settings.defaultKdv), cur: cur0, buyIn: fx0 ? p.buyFx ?? '' : p.buy ?? '', sellIn: fx0 && !p.autoPrice ? p.sellFx ?? '' : p.sell ?? '', margin: p.margin ?? '' });
    dl.forEach((n, i) => { const d = (p.dealers || [])[i] || {}; data['dm' + i] = d.m ?? ''; data['dp' + i] = d.p ?? (fx0 || p.autoPrice ? '' : p.prices?.[i + 1] ?? ''); });
    const f = CS.form(fields, data);
    const extra = document.createElement('div');
    extra.innerHTML = `<div class="row" style="margin-top:10px"><button class="btn sm" type="button" id="genbc">${icon('barcode', 15)} Barkod üret</button><label class="btn sm">${icon('upload', 15)} Görsel yükle<input type="file" accept="image/*" id="img" hidden></label>${p.image ? `<img src="${esc(p.image)}" id="imgp" style="height:48px;border-radius:6px">` : '<img id="imgp" style="height:48px;border-radius:6px;display:none">'}<button class="btn sm" type="button" id="imgdel" ${p.image ? '' : 'hidden'}>Görseli kaldır</button></div>
      <h3 class="form-sep" style="margin-top:16px">Varyantlar <small class="muted">beden, renk gibi özellikler</small></h3><div id="vars"></div>
      <h3 class="form-sep">Reçete / kombine ürün <small class="muted">üretimde ya da satışta düşülecek bileşenler</small></h3><div id="rec"></div>`;
    const prev = document.createElement('p'); prev.className = 'alert info'; prev.style.marginTop = '10px';
    const wrap = document.createElement('div'); wrap.append(f, prev, extra);
    // varyant editörü
    const va = p.variantAttrs ? JSON.parse(JSON.stringify(p.variantAttrs)) : {};
    const drawVars = () => { $('#vars', extra).innerHTML = `${Object.entries(va).map(([k, vals]) => `<div class="row" style="margin-bottom:6px"><b style="min-width:80px">${esc(k)}</b><input data-va="${esc(k)}" value="${esc(vals.join(', '))}" style="flex:1" aria-label="${esc(k)} değerleri"><button class="icon-btn danger" type="button" data-vadel="${esc(k)}" aria-label="Özelliği sil">${icon('trash', 15)}</button></div>`).join('')}<div class="row"><input id="vak" placeholder="Özellik adı (ör. Beden)"><input id="vav" placeholder="Değerler (ör. S, M, L)" style="flex:1"><button class="btn sm" type="button" id="vaadd">Özellik ekle</button></div>${p.variants?.length ? `<p class="muted">${p.variants.length} varyant mevcut. Yeni değer eklerseniz eksik kombinasyonlar oluşturulur.</p>` : ''}`; };
    drawVars();
    extra.addEventListener('click', (e) => { if (e.target.id === 'vaadd') { const k = $('#vak', extra).value.trim(), v = $('#vav', extra).value.split(',').map((x) => x.trim()).filter(Boolean); if (k && v.length) { va[k] = v; drawVars(); } } const d = e.target.closest('[data-vadel]'); if (d) { delete va[d.dataset.vadel]; drawVars(); } });
    extra.addEventListener('change', (e) => { if (e.target.dataset.va) va[e.target.dataset.va] = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); });
    // reçete editörü
    const rec = (p.recipe || []).map((r) => ({ ...r }));
    const drawRec = () => { $('#rec', extra).innerHTML = `<table class="lines"><thead><tr><th>Bileşen</th><th>Miktar</th><th>Birim maliyet</th><th></th></tr></thead><tbody>${rec.map((r, i) => `<tr><td>${esc(CS.productName(r.pid))}</td><td class="w-q"><input data-rq="${i}" value="${CS.qty(r.qty)}" inputmode="decimal"></td><td>${cc ? CS.fmt2(CS.product(r.pid)?.buy) : '—'}</td><td><button class="icon-btn danger" type="button" data-rdel="${i}" aria-label="Bileşeni sil">${icon('trash', 15)}</button></td></tr>`).join('')}</tbody></table><div class="row" style="margin-top:6px"><button class="btn sm" type="button" id="radd">Bileşen ekle</button>${cc ? '' : '<span hidden>'}<label class="row">İşçilik / ek maliyet <input id="labor" value="${CS.fmt2(p.labor || 0)}" style="width:90px" inputmode="decimal"></label>${cc ? '' : '</span>'}<label class="chk" style="padding:0"><input type="checkbox" id="kit" ${p.kit ? 'checked' : ''}> Kombine ürün: satıldığında bileşenlerin stoğu düşsün</label><span class="muted" id="rcost"></span></div>`; const cost = CS.sum(rec, (r) => CS.num(r.qty) * CS.num(CS.product(r.pid)?.buy)) + CS.num($('#labor', extra)?.value || p.labor); $('#rcost', extra).textContent = rec.length && cc ? 'Reçete maliyeti: ' + money(cost) : ''; };
    drawRec();
    extra.addEventListener('click', (e) => { if (e.target.id === 'radd') CS.pickProduct((x) => { if (x.id === p.id) return; rec.push({ pid: x.id, qty: 1 }); drawRec(); }); const d = e.target.closest('[data-rdel]'); if (d) { rec.splice(+d.dataset.rdel, 1); drawRec(); } if (e.target.id === 'genbc') { const src = CS.byId('sources', $('#f_sourceId', f).value); $('#f_barcode', f).value = CS.genBarcode(src?.code); } });
    extra.addEventListener('change', (e) => { if (e.target.dataset.rq != null) { rec[+e.target.dataset.rq].qty = CS.num(e.target.value); drawRec(); } });
    let image = p.image;
    extra.addEventListener('change', (e) => { if (e.target.id !== 'img') return; const file = e.target.files[0]; if (!file) return; resizeImage(file, 320, (url) => { image = url; const im = $('#imgp', extra); im.src = url; im.style.display = ''; $('#imgdel', extra).hidden = false; }); });
    extra.addEventListener('click', (e) => { if (e.target.id === 'imgdel') { image = ''; $('#imgp', extra).style.display = 'none'; e.target.hidden = true; } });
    // canlı fiyat önizlemesi (kur, kâr marjı, bayi fiyatları)
    const readPricing = () => {
      const g = (k) => $('#f_' + k, f); const cur = g('cur').value; const fx = cur !== '₺';
      const q = { cur, kdv: CS.num(g('kdv').value), autoPrice: cc ? g('autoPrice').checked : !!p.autoPrice, margin: cc ? (g('margin').value === '' ? '' : CS.num(g('margin').value)) : p.margin };
      if (cc) { if (fx) q.buyFx = CS.num(g('buyIn').value); else q.buy = CS.num(g('buyIn').value); } else { q.buy = p.buy; q.buyFx = p.buyFx; }
      if (fx && !q.autoPrice) q.sellFx = CS.num(g('sellIn').value); else if (!q.autoPrice) q.sell = CS.num(g('sellIn').value);
      q.dealers = dl.map((n, i) => ({ m: cc ? (g('dm' + i).value === '' ? '' : CS.num(g('dm' + i).value)) : (p.dealers || [])[i]?.m ?? '', p: g('dp' + i).value === '' ? '' : CS.num(g('dp' + i).value) }));
      return q;
    };
    const updPreview = () => {
      const q = readPricing(); const fx = q.cur !== '₺'; const rate = CS.rate(q.cur);
      $$('label', f).forEach((lb) => { const i = lb.querySelector('input,select'); if (!i) return; const sp = lb.querySelector('span'); if (i.id === 'f_buyIn') sp.textContent = `Alış fiyatı (${q.cur}, KDV hariç)`; if (i.id === 'f_sellIn') sp.textContent = `${pl[0]} satış fiyatı (${fx && !q.autoPrice ? q.cur : '₺'}, ${CS.db.settings.priceIncludesKdv ? 'KDV dahil' : 'KDV hariç'})`; if (/^f_dp\d$/.test(i.id)) sp.textContent = `${dl[+i.id.slice(-1)]} satış fiyatı (${fx ? q.cur : '₺'})`; });
      if (cc) { $('#f_sellIn', f).readOnly = q.autoPrice; }
      if (fx && !rate) { prev.innerHTML = `${q.cur} kuru henüz alınamadı. Üst çubuktaki kur düğmesinden kuru yenileyin ya da elle girin.`; return; }
      const t = { ...p, ...q, prices: [] }; if (!cc) { prev.innerHTML = `${fx ? `${q.cur} kuru ${CS.fmt2(rate)} ₺. ` : ''}Fiyatlar yöneticinin belirlediği maliyet ve kâr marjına göre hesaplanır.`; return; }
      const sv = CS.server; CS.server = null; CS.applyPricing(t); CS.server = sv;
      const mg = (i) => { const net = (i ? CS.num(t.prices[i]) : CS.num(t.sell)) / (CS.db.settings.priceIncludesKdv ? 1 + CS.num(t.kdv) / 100 : 1); return CS.num(t.buy) ? CS.fmt2(((net - CS.num(t.buy)) / CS.num(t.buy)) * 100) : '—'; };
      prev.innerHTML = `${fx ? `<b>${q.cur} kuru ${CS.fmt2(rate)} ₺</b> (${esc(CS.rates?.source || 'elle')}) · ` : ''}Alış: <b>${CS.money(t.buy)}</b> · ${esc(pl[0])}: <b>${CS.money(t.sell)}</b> (kâr %${mg(0)})${dl.map((n, i) => t.prices[i + 1] ? ` · ${esc(n)}: <b>${CS.money(t.prices[i + 1])}</b> (%${mg(i + 1)})` : '').join('')}`;
      if (q.autoPrice) { $('#f_sellIn', f).value = CS.fmt2(fx ? t.sell : t.sell); }
    };
    f.addEventListener('input', CS.debounce(updPreview, 150)); f.addEventListener('change', updPreview); setTimeout(updPreview, 0);
    // ortak barkod havuzu: okutulan barkod başka bir işletmede tanımlıysa adını getir
    f.addEventListener('change', async (e) => {
      if (e.target.id !== 'f_barcode' || !e.target.value.trim()) return; const code = e.target.value.trim();
      const own = CS.findByBarcode(code); if (own && own.id !== p.id) { CS.toast('Bu barkod zaten “' + CS.productName(own) + '” ürününüzde kayıtlı.', 'bad', 4000); return; }
      const lib = (CS.LIBRARY || []).find((r) => r[0] === code); const pool = lib ? { name: lib[1], unit: lib[3], category: lib[2] } : await CS.poolLookup(code);
      if (pool && !$('#f_name', f).value.trim()) { $('#f_name', f).value = pool.name; if (pool.unit && CS.db.units.includes(pool.unit)) $('#f_unit', f).value = pool.unit; const cat = CS.db.categories.find((c) => CS.trLower(c.name) === CS.trLower(pool.category || '')); if (cat) $('#f_cat', f).value = cat.id; CS.toast('Barkod havuzunda bulundu: ' + pool.name + (pool.users ? ` (${pool.users} işletmede kayıtlı)` : '')); }
    });

    CS.modal({
      title: isNew ? 'Yeni ürün' : 'Ürün kartı: ' + p.name, size: 'xl', body: wrap,
      buttons: [{ label: 'Vazgeç' }, {
        label: 'Kaydet', kind: 'primary', onClick: () => {
          const v = f.read(); if (!v) return false;
          if (v.barcode && CS.db.products.some((x) => x.id !== p.id && (x.barcode === v.barcode || (x.barcodes || []).includes(v.barcode)))) { CS.toast('Bu barkod başka bir üründe kayıtlı.', 'bad'); return false; }
          const old = CS.product(p.id); const q = readPricing();
          if (q.autoPrice && (q.margin === '' || q.margin == null)) { CS.toast('Otomatik fiyat için kâr marjı girin.', 'bad'); return false; }
          if (q.cur !== '₺' && !CS.rate(q.cur) && cc) { CS.toast(q.cur + ' kuru alınamadı; önce kuru yenileyin ya da elle girin.', 'bad'); return false; }
          const { buyIn, sellIn, margin, autoPrice, cur, ...rest } = v; [0, 1, 2].forEach((i) => { delete rest['dm' + i]; delete rest['dp' + i]; });
          Object.assign(p, rest); p.kdv = +v.kdv; p.barcodes = v.barcodes ? v.barcodes.split(',').map((x) => x.trim()).filter(Boolean) : [];
          p.cur = q.cur; p.dealers = q.dealers;
          if (cc) { p.margin = q.margin; p.autoPrice = q.autoPrice; if (q.cur !== '₺') { p.buyFx = q.buyFx; } else { p.buy = q.buy; delete p.buyFx; } }
          if (!q.autoPrice) { if (q.cur !== '₺') p.sellFx = q.sellFx; else { p.sell = q.sell; delete p.sellFx; } }
          if (cc || !(q.cur !== '₺' || q.autoPrice)) { p.prices = [p.sell].concat(q.dealers.map((d) => (d.p !== '' ? d.p : ''))); }
          CS.applyPricing(p); if (!p.prices?.[0]) p.prices = [p.sell].concat((p.prices || []).slice(1));
          if (old && (CS.num(old.sell) !== CS.num(p.sell) || CS.num(old.buy) !== CS.num(p.buy))) (p.priceHist = p.priceHist || []).push({ at: CS.now(), user: CS.user.name, sellOld: old.sell, sellNew: p.sell, buyOld: cc ? old.buy : undefined, buyNew: cc ? p.buy : undefined });
          p.image = image; p.recipe = rec.filter((r) => r.pid); p.labor = CS.num($('#labor', extra)?.value); p.kit = $('#kit', extra)?.checked;
          const openStock = v.openStock, openWh = v.openWh; delete p.openStock; delete p.openWh;
          if (!p.id) { p.id = 'p_' + CS.uid(); p.stock = {}; p.createdAt = CS.now(); CS.db.products.push(p); }
          else { const i = CS.db.products.findIndex((x) => x.id === p.id); p.stock = CS.db.products[i].stock; CS.db.products[i] = p; }
          // varyantları oluştur / güncelle
          const keys = Object.keys(va).filter((k) => va[k].length);
          if (keys.length) {
            p.variantAttrs = va; p.variants = p.variants || [];
            const combos = keys.reduce((acc, k) => acc.flatMap((c) => va[k].map((v2) => ({ ...c, [k]: v2 }))), [{}]);
            combos.forEach((attrs) => {
              let ex = p.variants.map(CS.product).find((x) => x && JSON.stringify(x.attrs) === JSON.stringify(attrs));
              if (!ex) { ex = { id: 'p_' + CS.uid(), parentId: p.id, attrs, barcode: '', code: (p.code || 'V') + '-' + Object.values(attrs).join('-'), stock: {}, active: true }; CS.db.products.push(ex); p.variants.push(ex.id); }
              Object.assign(ex, { name: p.name, cat: p.cat, brand: p.brand, unit: p.unit, kdv: p.kdv, otv: p.otv, critical: ex.critical ?? p.critical });
              if (!ex.priceSet) { Object.assign(ex, { cur: p.cur, buyFx: p.buyFx, margin: p.margin, autoPrice: p.autoPrice, sellFx: p.sellFx, dealers: JSON.parse(JSON.stringify(p.dealers || [])), sell: p.sell, buy: p.buy, prices: [...(p.prices || [])], sourceId: p.sourceId }); CS.applyPricing(ex); }
            });
          } else if (!p.variants?.length) { delete p.variantAttrs; }
          if (openStock && !p.service && !keys.length) CS.addMove({ pid: p.id, wh: openWh, qty: openStock, type: 'acilis', ref: 'open_' + p.id, cost: CS.num(p.buy) });
          CS.log(isNew ? 'Ürün eklendi' : 'Ürün güncellendi', p.name); CS.save(); CS.refreshBadges();
          onSaved ? onSaved(p) : CS.route();
          if (keys.length && isNew) CS.toast(p.variants.length + ' varyant oluşturuldu. Ürün sayfasından barkod ve stoklarını girin.');
        }
      }]
    });
  }
  CS.productForm = productForm;
  function resizeImage(file, max, cb) { const r = new FileReader(); r.onload = () => { const img = new Image(); img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); cb(c.toDataURL('image/jpeg', 0.75)); }; img.src = r.result; }; r.readAsDataURL(file); }
  CS.resizeImage = resizeImage;

  /* ---------- Ürün detay ---------- */
  function detail(page, id) {
    const p = CS.product(id); if (!p) { page.innerHTML = '<div class="blank"><h2>Ürün bulunamadı</h2><a href="#products">Ürün listesine dön</a></div>'; return; }
    const parent = p.parentId && CS.product(p.parentId);
    const body = CS.head(page, CS.productName(p), `<a class="btn" href="#products">Listeye dön</a>${CS.can('products', 'e') ? CS.btn('Düzenle', 'edit', '', 'edit') + CS.btn('Stok ekle / düzelt', 'adj', '', 'layers') : ''}${CS.btn('Etiket', 'label', '', 'tag')}${p.recipe?.length && CS.can('production', 'e') ? CS.btn('Üret', 'prod', 'primary', 'factory') : ''}`);
    const ms = CS.db.moves.filter((m) => m.pid === p.id || (p.variants || []).includes(m.pid)).sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));
    const L = CS.saleLines(CS.addDays(CS.today(), -365), CS.today(), null).filter((l) => l.pid === p.id || (p.variants || []).includes(l.pid));
    const L30 = L.filter((l) => l.date >= CS.addDays(CS.today(), -30));
    const vs = (p.variants || []).map(CS.product).filter(Boolean);
    const T = { satis: 'Satış', pos: 'POS satış', alis: 'Alış', satis_iade: 'Satış iadesi', pos_iade: 'POS iade', alis_iade: 'Alış iadesi', irsaliye: 'Sevk', alis_irsaliye: 'Alış irsaliyesi', transfer: 'Depo transferi', sayim: 'Sayım farkı', acilis: 'Açılış', duzelt: 'Stok düzeltme', uretim_g: 'Üretim girişi', uretim_c: 'Üretimde kullanım', fire: 'Fire / zayi' };
    const avgDaily = CS.sum(L30, 'qty') / 30; const cover = avgDaily > 0 ? CS.stockOf(p) / avgDaily : null;
    body.innerHTML = `${parent ? `<p class="alert info">Bu ürün <a href="#products/${parent.id}">${esc(parent.name)}</a> ürününün varyantıdır.</p>` : ''}
      <div class="kpis">${CS.kpi('Toplam stok', p.service ? 'Hizmet' : CS.qty(vs.length ? CS.sum(vs, (v) => CS.stockOf(v)) : CS.stockOf(p)) + ' ' + esc(p.unit || ''), CS.isCritical(p) ? '<span class="neg">Kritik seviyenin altında</span>' : 'Kritik: ' + CS.qty(p.critical || 0), 'hl')}${CS.kpi('Satış fiyatı', money(p.sell), CS.db.settings.priceLists.slice(1).map((n, i) => n + ': ' + CS.fmt2(p.prices?.[i + 1] || p.sell)).join(' · '))}${CS.canCost() ? CS.kpi('Alış / maliyet', money(p.buy) + (p.cur && p.cur !== '₺' ? ` <small>${CS.fxMoney(p.buyFx, p.cur)}</small>` : ''), 'Kâr %' + CS.fmt2(margin(p)) + (p.autoPrice ? ' · otomatik fiyat' : '')) : ''}${CS.kpi('Son 30 gün satış', CS.qty(CS.sum(L30, 'qty')) + ' ' + esc(p.unit || ''), money(CS.sum(L30, 'total')))}${CS.kpi('Stok yeterlilik', cover == null ? '—' : Math.round(cover) + ' gün', 'Günlük ort. ' + CS.qty(avgDaily))}${CS.canCost() ? CS.kpi('Son 12 ay kâr', money(CS.sum(L, 'net') - CS.sum(L, 'cost')), CS.qty(CS.sum(L, 'qty')) + ' adet satış') : ''}</div>
      <div class="grid g2">
        <section class="panel"><h2>Ürün bilgileri</h2><div class="list">
          <div><span>Barkod</span><b>${esc(p.barcode || '—')} ${(p.barcodes || []).length ? '<small class="muted">+' + p.barcodes.join(', ') + '</small>' : ''}</b></div><div><span>Stok kodu</span><b>${esc(p.code || '—')}</b></div><div><span>Kategori / marka</span><b>${esc(CS.categoryName(p.cat) || '—')} / ${esc(CS.byId('brands', p.brand)?.name || '—')}</b></div><div><span>KDV / ÖTV</span><b>%${p.kdv} / %${CS.num(p.otv)}</b></div><div><span>Tedarikçi</span><b>${esc(CS.contactName(p.supplierId) || '—')}</b></div><div><span>Raf yeri</span><b>${esc(p.shelf || '—')}</b></div>${p.desc ? `<div><span>${esc(p.desc)}</span></div>` : ''}</div>
          ${p.barcode ? `<div style="max-width:240px;margin-top:10px;color:var(--ink)">${CS.barcodeSVG(p.barcode)}</div>` : ''}${p.image ? `<img src="${esc(p.image)}" alt="" style="max-width:160px;border-radius:8px;margin-top:8px">` : ''}</section>
        <section class="panel"><h2>Depo bazında stok</h2><div class="list">${CS.db.warehouses.map((w) => `<div><span>${esc(w.name)}</span><b>${CS.qty(vs.length ? CS.sum(vs, (v) => CS.stockOf(v, w.id)) : CS.stockOf(p, w.id))}</b></div>`).join('')}</div>
          ${p.recipe?.length ? `<h2 style="margin-top:16px">Reçete</h2><div class="list">${p.recipe.map((r) => `<div><span>${esc(CS.productName(r.pid))}</span><b>${CS.qty(r.qty)} × ${CS.fmt2(CS.product(r.pid)?.buy)}</b></div>`).join('')}<div><span>İşçilik</span><b>${money(p.labor || 0)}</b></div><div><span>Birim maliyet</span><b>${money(recipeCost(p))}</b></div></div><button class="btn sm" data-a="recpdf">Reçeteyi PDF olarak indir</button>` : ''}</section>
      </div>
      ${vs.length ? `<section class="panel" style="margin-top:14px"><h2>Varyantlar</h2><div id="vt"></div></section>` : ''}
      <section class="panel" style="margin-top:14px"><h2>Stok hareketleri</h2><div id="mt"></div></section>`;
    if (vs.length) CS.table($('#vt', body), { rows: vs, search: false, cols: [{ l: 'Varyant', v: (v) => Object.values(v.attrs).join(' / ') }, { l: 'Barkod', k: 'barcode', f: (v) => `<input data-vb="${v.id}" value="${esc(v.barcode || '')}" style="width:150px" aria-label="Barkod">` }, { l: 'Satış', a: 'r', f: (v) => `<input data-vs="${v.id}" value="${CS.fmt2(v.sell)}" style="width:90px;text-align:right" aria-label="Satış fiyatı">` }, ...CS.db.warehouses.map((w) => ({ l: w.name, a: 'r', v: (v) => CS.stockOf(v, w.id), f: (v) => CS.qty(CS.stockOf(v, w.id)) }))], actions: (v) => CS.actBtn('open', 'Aç', 'eye'), onAct: (a, v) => CS.go('products/' + v.id) });
    body.addEventListener('change', (e) => { const b = e.target.dataset.vb, s = e.target.dataset.vs; if (b) { CS.product(b).barcode = e.target.value.trim(); CS.save(); CS.toast('Barkod kaydedildi.'); } if (s) { const v = CS.product(s); v.sell = CS.num(e.target.value); v.priceSet = true; v.prices = [v.sell]; CS.save(); CS.toast('Fiyat kaydedildi.'); } });
    let bal = 0; const withBal = ms.slice().reverse().map((m) => { bal += m.qty; return { ...m, bal }; }).reverse();
    CS.table($('#mt', body), { rows: withBal, pageSize: 30, cols: [{ l: 'Tarih', k: 'date', f: (m) => CS.date(m.date) }, { l: 'İşlem', v: (m) => T[m.type] || m.type }, { l: 'Belge / açıklama', v: (m) => m.note || '', f: (m) => { const d = CS.db.docs.find((x) => x.id === m.ref); return d ? `<a href="#docs/view/${d.id}">${esc(d.no)}</a> ${esc(CS.contactName(d.cid))}` : esc(m.note || ''); } }, { l: 'Depo', v: (m) => CS.whName(m.wh) }, { l: 'Giriş', a: 'r', v: (m) => (m.qty > 0 ? m.qty : 0), f: (m) => (m.qty > 0 ? `<span class="pos">${CS.qty(m.qty)}</span>` : '') }, { l: 'Çıkış', a: 'r', v: (m) => (m.qty < 0 ? -m.qty : 0), f: (m) => (m.qty < 0 ? `<span class="neg">${CS.qty(-m.qty)}</span>` : '') }, { l: 'Bakiye', a: 'r', v: (m) => m.bal, f: (m) => CS.qty(m.bal) }, ...(CS.canCost() ? [{ l: 'Birim fiyat', a: 'r', v: (m) => m.price || m.cost, f: (m) => CS.fmt2(m.price || m.cost) }] : [])] });
    CS.bind(page, { edit: () => productForm(p), label: () => labelDialog([{ pid: p.id, qty: 1 }]), adj: () => CS.stockAdjust && CS.stockAdjust(p), prod: () => CS.productionForm && CS.productionForm(p), recpdf: () => printRecipe(p) });
  }
  const recipeCost = (p) => CS.sum(p.recipe || [], (r) => CS.num(r.qty) * CS.num(CS.product(r.pid)?.buy)) + CS.num(p.labor);
  CS.recipeCost = recipeCost;
  function printRecipe(p) { CS.printHTML(`<h1>Ürün reçetesi: ${esc(p.name)}</h1><p class="muted">${esc(CS.db.company.name)} · ${CS.date(CS.today())}</p><table><tr><th>Bileşen</th><th class="r">Miktar</th><th class="r">Birim maliyet</th><th class="r">Tutar</th></tr>${p.recipe.map((r) => { const c = CS.product(r.pid); return `<tr><td>${esc(CS.productName(c))}</td><td class="r">${CS.qty(r.qty)} ${esc(c?.unit || '')}</td><td class="r">${CS.fmt2(c?.buy)}</td><td class="r">${CS.fmt2(r.qty * CS.num(c?.buy))}</td></tr>`; }).join('')}<tr><td colspan="3">İşçilik / ek maliyet</td><td class="r">${CS.fmt2(p.labor || 0)}</td></tr><tr class="tot"><td colspan="3">Birim maliyet</td><td class="r">${CS.fmt2(recipeCost(p))}</td></tr></table>`, 'Reçete ' + p.name); }

  /* ---------- Kategoriler ---------- */
  function cats(body) {
    body.innerHTML = `<div class="row" style="margin-bottom:10px">${CS.can('products', 'e') ? CS.btn('Kategori ekle', 'add', 'primary', 'plus') : ''}</div><div id="ct"></div>`;
    const t = CS.table($('#ct', body), { rows: CS.db.categories, cols: [{ l: 'Kategori', v: (c) => c.name, f: (c) => (c.parent ? `<span class="muted">${esc(CS.categoryName(c.parent))} › </span>` : '') + `<b>${esc(c.name)}</b>` }, { l: 'Ürün sayısı', a: 'r', v: (c) => CS.db.products.filter((p) => p.cat === c.id && !p.parentId).length }, { l: 'Varsayılan KDV', a: 'r', v: (c) => (c.kdv != null && c.kdv !== '' ? '%' + c.kdv : '') }], onRow: (c) => CS.go('products?cat=' + c.id), actions: (c) => (CS.can('products', 'e') ? CS.actBtn('edit', 'Düzenle', 'edit') : '') + (CS.can('products', 'd') ? CS.actBtn('del', 'Sil', 'trash', 'danger') : ''), onAct: (a, c) => (a === 'edit' ? edit(c) : CS.db.products.some((p) => p.cat === c.id) ? CS.toast('Bu kategoride ürün var; önce ürünleri taşıyın.', 'bad') : CS.confirm(c.name + ' silinsin mi?', () => { CS.db.categories = CS.db.categories.filter((x) => x !== c); CS.save(); CS.route(); })) });
    const edit = (c) => { const f = CS.form([{ k: 'name', l: 'Kategori adı', req: true }, { k: 'parent', l: 'Üst kategori', t: 'select', opts: [['', '— Yok —']].concat(CS.db.categories.filter((x) => x !== c).map((x) => [x.id, x.name])) }, { k: 'kdv', l: 'Varsayılan KDV %', t: 'select', opts: [''].concat(CS.KDV_RATES.map(String)) }], c || {}); CS.modal({ title: c ? 'Kategori düzenle' : 'Yeni kategori', size: 'sm', body: f, buttons: [{ label: 'Vazgeç' }, { label: 'Kaydet', kind: 'primary', onClick: () => { const v = f.read(); if (!v) return false; if (c) Object.assign(c, v); else CS.db.categories.push({ id: 'cat_' + CS.uid(), ...v }); CS.save(); CS.route(); } }] }); };
    CS.bind(body, { add: () => edit() });
  }
  function brands(body) {
    body.innerHTML = `<div class="grid g2"><section class="panel"><h2>Markalar</h2><div class="row" style="margin-bottom:8px"><input id="bn" placeholder="Marka adı" style="flex:1"><button class="btn" data-a="badd">Ekle</button></div><div class="list">${CS.db.brands.map((b) => `<div><span>${esc(b.name)} <small class="muted">${CS.db.products.filter((p) => p.brand === b.id && !p.parentId).length} ürün</small></span><button class="icon-btn danger" data-bdel="${b.id}" aria-label="Sil">${icon('trash', 15)}</button></div>`).join('') || '<p class="empty">Marka yok.</p>'}</div></section>
      <section class="panel"><h2>Birimler</h2><div class="row" style="margin-bottom:8px"><input id="un" placeholder="Birim adı (ör. Deste)" style="flex:1"><button class="btn" data-a="uadd">Ekle</button></div><div class="list">${CS.db.units.map((u) => `<div><span>${esc(u)}</span><button class="icon-btn danger" data-udel="${esc(u)}" aria-label="Sil">${icon('trash', 15)}</button></div>`).join('')}</div>
      <h2 style="margin-top:16px">Fiyat listeleri</h2><p class="muted">Müşterilere farklı fiyat uygulamak için. İlk liste varsayılan satış fiyatıdır.</p><div class="list">${CS.db.settings.priceLists.map((n, i) => `<div><span>${i + 1}. ${esc(n)}</span>${i ? `<button class="icon-btn danger" data-pldel="${i}" aria-label="Sil">${icon('trash', 15)}</button>` : ''}</div>`).join('')}</div><div class="row"><input id="pln" placeholder="Yeni liste adı (ör. İnternet)" style="flex:1"><button class="btn" data-a="pladd">Ekle</button></div></section></div>`;
    CS.bind(body, { badd: () => { const v = $('#bn', body).value.trim(); if (v) { CS.db.brands.push({ id: 'b_' + CS.uid(), name: v }); CS.save(); CS.route(); } }, uadd: () => { const v = $('#un', body).value.trim(); if (v && !CS.db.units.includes(v)) { CS.db.units.push(v); CS.save(); CS.route(); } }, pladd: () => { const v = $('#pln', body).value.trim(); if (v) { CS.db.settings.priceLists.push(v); CS.save(); CS.route(); } } });
    body.addEventListener('click', (e) => { const b = e.target.closest('[data-bdel]'), u = e.target.closest('[data-udel]'), pl = e.target.closest('[data-pldel]'); if (b) { CS.db.brands = CS.db.brands.filter((x) => x.id !== b.dataset.bdel); CS.save(); CS.route(); } if (u) { CS.db.units = CS.db.units.filter((x) => x !== u.dataset.udel); CS.save(); CS.route(); } if (pl) { CS.db.settings.priceLists.splice(+pl.dataset.pldel, 1); CS.save(); CS.route(); } });
  }

  /** Ürün içe aktarımı (Excel ekranı ve toplu işlemler ortak kullanır). opts: { mode: 'upsert'|'new'|'update', wh, stockMode: 'set'|'add' } */
  CS.importProducts = function (items, opts = {}) {
      let n = 0, u = 0, skip = 0; const errors = [];
      items.forEach((o, ix) => {
        if (!o.name && !o.barcode && !o.code) { skip++; errors.push([ix + 1, 'Ürün adı, barkod ve stok kodu boş']); return; }
        o.barcode = o.barcode ? String(o.barcode).replace(/\.0+$/, '').trim() : o.barcode;
        let p = CS.db.products.find((x) => (o.barcode && (x.barcode === o.barcode || (x.barcodes || []).includes(o.barcode))) || (o.code && x.code === o.code)) || (!o.barcode && !o.code && o.name ? CS.db.products.find((x) => CS.trLower(x.name) === CS.trLower(o.name) && !x.parentId) : null);
        if (p && opts.mode === 'new') { skip++; errors.push([ix + 1, 'Zaten kayıtlı: ' + p.name]); return; }
        if (!p && opts.mode === 'update') { skip++; errors.push([ix + 1, 'Eşleşen ürün yok: ' + (o.barcode || o.code || o.name)]); return; }
        if (!p && !o.name) { skip++; errors.push([ix + 1, 'Yeni ürün için ürün adı gerekli']); return; }
        let wh = opts.wh || CS.defaultWh(); if (o.warehouse) { const w = CS.db.warehouses.find((x) => CS.trLower(x.name) === CS.trLower(o.warehouse)); if (w) wh = w.id; }
        let cat = ''; if (o.category) { cat = CS.db.categories.find((c) => CS.trLower(c.name) === CS.trLower(o.category))?.id; if (!cat) { cat = 'cat_' + CS.uid(); CS.db.categories.push({ id: cat, name: o.category }); } }
        let brand = ''; if (o.brand) { brand = CS.db.brands.find((c) => CS.trLower(c.name) === CS.trLower(o.brand))?.id; if (!brand) { brand = 'b_' + CS.uid(); CS.db.brands.push({ id: brand, name: o.brand }); } }
        if (o.unit && !CS.db.units.includes(o.unit)) CS.db.units.push(o.unit);
        const has = (k) => o[k] !== undefined && o[k] !== '';
        let sourceId; if (has('source')) { let sx = (CS.db.sources = CS.db.sources || []).find((x) => CS.trLower(x.name) === CS.trLower(o.source)); if (!sx) { sx = { id: 'src_' + CS.uid(), name: o.source, code: String(CS.db.sources.length + 1).padStart(3, '0') }; CS.db.sources.push(sx); } sourceId = sx.id; }
        const vals = { ...(o.name && { name: o.name }), ...(o.barcode && { barcode: o.barcode }), ...(o.code && { code: o.code }), ...(cat && { cat }), ...(brand && { brand }), ...(o.unit && { unit: o.unit }), ...(has('kdv') && { kdv: CS.num(String(o.kdv).replace('%', '')) }), ...(has('critical') && { critical: CS.num(o.critical) }), ...(o.desc && { desc: o.desc }), ...(sourceId && { sourceId }) };
        if (p) { Object.assign(p, vals); u++; } else { p = { id: 'p_' + CS.uid(), active: true, unit: 'Adet', kdv: CS.db.settings.defaultKdv, buy: 0, sell: 0, stock: {}, ...vals }; CS.db.products.push(p); n++; }
        if (has('cur') || !p.cur) p.cur = has('cur') ? normCur(o.cur) : p.cur || '₺'; const fx = p.cur !== '₺';
        if (has('buy') && CS.canCost()) { if (fx) p.buyFx = CS.num(o.buy); else p.buy = CS.num(o.buy); }
        if (has('margin') && CS.canCost()) { p.margin = CS.num(String(o.margin).replace('%', '')); p.autoPrice = true; } else if (has('sell')) { p.autoPrice = false; if (fx) p.sellFx = CS.num(o.sell); else p.sell = CS.num(o.sell); }
        p.dealers = p.dealers || [{}, {}, {}]; [1, 2, 3].forEach((i) => { const d = (p.dealers[i - 1] = p.dealers[i - 1] || {}); if (has('dm' + i) && CS.canCost()) d.m = CS.num(String(o['dm' + i]).replace('%', '')); if (has('dp' + i)) { d.p = CS.num(o['dp' + i]); if (!has('dm' + i)) d.m = ''; } });
        if (!fx && !p.autoPrice) { p.prices = [p.sell].concat(p.dealers.map((d) => (d.p !== '' && d.p != null ? d.p : ''))); }
        CS.applyPricing(p);
        if (o.stock !== undefined && o.stock !== '' && !p.service) { const diff = opts.stockMode === 'add' ? CS.num(o.stock) : CS.num(o.stock) - CS.stockOf(p, wh); if (diff) CS.addMove({ pid: p.id, wh, qty: diff, type: 'duzelt', ref: 'imp_' + CS.today(), note: 'Excel içe aktarım', cost: CS.num(p.buy) }); }
      });
      CS.log('Excel ile ürün aktarıldı', `${n} yeni, ${u} güncelleme`); CS.save(); CS.refreshBadges && CS.refreshBadges();
      return { n, u, skip, errors };
  };

  /* ---------- Toplu işlemler ---------- */
  const IMPORT_COLS = [['name', 'Ürün adı'], ['barcode', 'Barkod'], ['code', 'Stok kodu'], ['category', 'Kategori'], ['brand', 'Marka'], ['unit', 'Birim'], ['cur', 'Para birimi'], ['buy', 'Alış fiyatı'], ['margin', 'Kâr %'], ['sell', 'Satış fiyatı'], ['dm1', 'Bayi 1 kâr %'], ['dp1', 'Bayi 1 fiyatı'], ['dm2', 'Bayi 2 kâr %'], ['dp2', 'Bayi 2 fiyatı'], ['dm3', 'Bayi 3 kâr %'], ['dp3', 'Bayi 3 fiyatı'], ['kdv', 'KDV'], ['critical', 'Kritik stok'], ['stock', 'Stok'], ['source', 'Alındığı yer'], ['desc', 'Açıklama']];
  const normCur = (c) => { c = CS.trLower(String(c || '')).trim(); return /usd|\$|dolar/.test(c) ? 'USD' : /eur|€|avro|euro/.test(c) ? 'EUR' : /gbp|£|sterlin/.test(c) ? 'GBP' : '₺'; };
  function bulk(body) {
    body.innerHTML = `<div class="grid g2">
      <section class="panel"><h2>Excel / CSV ile ürün yükle</h2><p class="muted">Sütunlar: ${IMPORT_COLS.map((c) => c[1]).join(', ')}. Barkod ya da stok kodu eşleşen ürünler güncellenir, diğerleri eklenir. Stok sütunu doluysa fark kadar stok düzeltmesi yapılır.</p>
        <div class="drop" id="drop">Dosyayı buraya bırakın ya da <label class="btn sm">dosya seçin<input type="file" id="file" accept=".csv,.txt,.xlsx,.xls" hidden></label></div>
        <p><a class="btn sm primary" href="#import?t=products">Gelişmiş Excel aktarımı (sütun eşleştirme)</a> <button class="btn sm" data-a="tpl">${icon('down', 15)} Örnek şablonu indir</button> <button class="btn sm" data-a="paste">Excel'den yapıştır</button></p><div id="prev"></div></section>
      <section class="panel"><h2>Toplu fiyat güncelle</h2><div id="pf"></div><p><button class="btn primary" data-a="price">Önizle ve uygula</button></p></section>
      <section class="panel"><h2>Toplu kategori / KDV / durum değiştir</h2><div id="cf"></div><p><button class="btn" data-a="mass">Uygula</button></p></section>
      <section class="panel"><h2>Dışa aktar</h2><p class="muted">Tüm ürünleri fiyat ve depo stoklarıyla birlikte indirin.</p><div class="row"><button class="btn" data-a="xls">${icon('down', 15)} Excel</button><button class="btn" data-a="csv">${icon('down', 15)} CSV</button><button class="btn" data-a="pdf">${icon('print', 15)} Fiyat listesi yazdır</button></div></section>
    </div>`;
    const catOpts = [['', 'Tüm kategoriler']].concat(CS.db.categories.map((c) => [c.id, c.name]));
    const pf = CS.form([{ k: 'cat', l: 'Kategori', t: 'select', opts: catOpts }, { k: 'brand', l: 'Marka', t: 'select', opts: [['', 'Tüm markalar']].concat(CS.db.brands.map((b) => [b.id, b.name])) }, { k: 'field', l: 'Değişecek fiyat', t: 'select', opts: [['sell', 'Satış fiyatı']].concat(CS.db.settings.priceLists.slice(1).map((n, i) => ['p' + (i + 1), n + ' fiyatı'])).concat(CS.canCost() ? [['buy', 'Alış fiyatı'], ['fromBuy', 'Satışı alış + kâr oranına göre hesapla'], ['margin', 'Kâr marjını ata (otomatik fiyata geçer)']] : []) }, { k: 'mode', l: 'Yöntem', t: 'select', opts: [['pct', 'Yüzde artır / azalt'], ['amt', 'Tutar ekle / çıkar'], ['set', 'Sabit fiyat ata']] }, { k: 'val', l: 'Değer (azaltmak için eksi)', t: 'number', req: true }, { k: 'round', l: 'Yuvarlama', t: 'select', opts: [['', 'Yok'], ['0.1', '0,10'], ['0.5', '0,50'], ['1', '1 ₺'], ['0.99', ',99 ile bitir'], ['5', '5 ₺']] }]);
    $('#pf', body).appendChild(pf);
    const cf = CS.form([{ k: 'cat', l: 'Kaynak kategori', t: 'select', opts: catOpts }, { k: 'q', l: 'Ad içerenler', ph: 'boş = hepsi' }, { k: 'newCat', l: 'Yeni kategori', t: 'select', opts: [['', '— Değiştirme —']].concat(CS.db.categories.map((c) => [c.id, c.name])) }, { k: 'kdv', l: 'Yeni KDV %', t: 'select', opts: [''].concat(CS.KDV_RATES.map(String)) }, { k: 'active', l: 'Durum', t: 'select', opts: [['', '— Değiştirme —'], ['1', 'Aktif yap'], ['0', 'Pasif yap']] }, { k: 'quick', l: 'Hızlı satış', t: 'select', opts: [['', '— Değiştirme —'], ['1', 'Ekranda göster'], ['0', 'Gizle']] }]);
    $('#cf', body).appendChild(cf);
    const drop = $('#drop', body);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); readFile(e.dataTransfer.files[0]); };
    $('#file', body).onchange = (e) => readFile(e.target.files[0]);
    function readFile(file) { if (!file) return; if (/\.xlsx?$/i.test(file.name)) { if (!window.XLSX) { CS.toast('Excel okuyucu yüklenemedi (internet gerekli). Dosyayı CSV olarak kaydedip deneyin.', 'bad', 5000); return; } const r = new FileReader(); r.onload = () => { const wb = XLSX.read(r.result, { type: 'array' }); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false }); preview(rows); }; r.readAsArrayBuffer(file); } else { const r = new FileReader(); r.onload = () => preview(parseCSV(r.result)); r.readAsText(file, 'utf-8'); } }
    function preview(rows) {
      rows = rows.filter((r) => r.some((c) => String(c ?? '').trim())); if (rows.length < 2) { CS.toast('Dosyada veri bulunamadı.', 'bad'); return; }
      const head = rows[0].map((h) => CS.trLower(String(h).trim())); const idx = {}; IMPORT_COLS.forEach(([k, l]) => { let i = head.findIndex((h) => h === CS.trLower(l) || h === k); if (i < 0 && !/^d[mp]\d$/.test(k)) i = head.findIndex((h, j) => !Object.values(idx).includes(j) && h.startsWith(CS.trLower(l).split(' ')[0]) && !/bayi/.test(h)); if (i >= 0) idx[k] = i; });
      if (idx.name == null) { CS.toast('“Ürün adı” sütunu bulunamadı.', 'bad'); return; }
      const items = rows.slice(1).map((r) => { const o = {}; for (const k in idx) o[k] = String(r[idx[k]] ?? '').trim(); return o; }).filter((o) => o.name);
      const upd = items.filter((o) => CS.db.products.find((p) => (o.barcode && p.barcode === o.barcode) || (o.code && p.code === o.code))).length;
      $('#prev', body).innerHTML = `<p class="alert info">${items.length} satır okundu: ${items.length - upd} yeni ürün, ${upd} güncelleme.</p><div class="tbl-wrap" style="max-height:220px"><table class="tbl"><tr>${Object.keys(idx).map((k) => `<th>${IMPORT_COLS.find((c) => c[0] === k)[1]}</th>`).join('')}</tr>${items.slice(0, 20).map((o) => `<tr>${Object.keys(idx).map((k) => `<td>${esc(o[k])}</td>`).join('')}</tr>`).join('')}</table></div><p><button class="btn primary" id="doimp">İçe aktar</button></p>`;
      $('#doimp', body).onclick = () => doImport(items);
    }
    function doImport(items) { const r = CS.importProducts(items); CS.toast(`${r.n} ürün eklendi, ${r.u} ürün güncellendi.`); CS.go('products'); }
    CS.bind(body, {
      tpl: () => CS.exportXLS('cepstok-urun-sablonu', IMPORT_COLS.map((c) => c[1]), [['Örnek ürün (TL)', '8690000000017', 'STK0001', 'Gıda', 'Marka', 'Adet', 'TL', 10, 50, '', 30, '', 25, '', 20, '', 20, 5, 100, 'Merkez toptancı', ''], ['Örnek ürün (dolar)', '8690000000024', 'STK0002', 'Elektronik', 'Marka', 'Adet', 'USD', 12.5, 40, '', 25, '', '', 15.5, '', '', 20, 2, 10, 'İthalatçı', 'Alış ve sabit bayi fiyatı dolar; satış kurla hesaplanır']]),
      paste: () => CS.modal({ title: 'Excel’den yapıştır', body: '<p class="muted">Excel’de başlık satırıyla birlikte hücreleri kopyalayıp buraya yapıştırın.</p><textarea id="pt" rows="10" style="width:100%"></textarea>', buttons: [{ label: 'Vazgeç' }, { label: 'Önizle', kind: 'primary', onClick: (c, el) => preview($('#pt', el).value.split(/\r?\n/).map((l) => l.split('\t'))) }] }),
      price: () => {
        const v = pf.read(); if (!v) return; const field = v.field;
        const ps = CS.db.products.filter((p) => p.active !== false && (!v.cat || p.cat === v.cat) && (!v.brand || p.brand === v.brand) && (['buy', 'margin'].includes(field) || !(p.autoPrice || (p.cur && p.cur !== '₺'))));
        const calc = (p) => { const li = field[0] === 'p' && field !== 'p' ? +field.slice(1) : null; const old = field === 'buy' ? CS.num(p.buy) : field === 'sell' || field === 'fromBuy' ? CS.num(p.sell) : CS.num(p.prices?.[li] || p.sell); let n; if (field === 'margin') { n = CS.num(p.buy) * (1 + v.val / 100) * (CS.db.settings.priceIncludesKdv ? 1 + CS.num(p.kdv) / 100 : 1); } else if (field === 'fromBuy') { n = CS.num(p.buy) * (1 + v.val / 100); if (CS.db.settings.priceIncludesKdv) n *= 1 + CS.num(p.kdv) / 100; } else n = v.mode === 'pct' ? old * (1 + v.val / 100) : v.mode === 'amt' ? old + v.val : v.val; n = roundP(n, v.round); return { old, n, li }; };
        CS.modal({ title: `Fiyat güncelleme önizlemesi (${ps.length} ürün)`, size: 'lg', body: `<div class="tbl-wrap" style="max-height:50vh"><table class="tbl"><tr><th>Ürün</th><th class="r">Eski</th><th class="r">Yeni</th></tr>${ps.slice(0, 300).map((p) => { const c = calc(p); return `<tr><td>${esc(CS.productName(p))}</td><td class="r">${CS.fmt2(c.old)}</td><td class="r"><b>${CS.fmt2(c.n)}</b></td></tr>`; }).join('')}</table></div>`, buttons: [{ label: 'Vazgeç' }, { label: 'Fiyatları güncelle', kind: 'primary', onClick: () => { ps.forEach((p) => { const c = calc(p); (p.priceHist = p.priceHist || []).push({ at: CS.now(), user: CS.user.name, field, old: c.old, new: c.n, bulk: true }); if (field === 'margin') { p.autoPrice = true; p.margin = v.val; CS.applyPricing(p); } else if (field === 'buy') { if (p.cur && p.cur !== '₺') p.buyFx = CS.round(c.n / CS.rate(p.cur), 4); else p.buy = c.n; CS.applyPricing(p); } else if (field === 'sell' || field === 'fromBuy') { p.sell = c.n; if (p.prices) p.prices[0] = c.n; } else { p.prices = p.prices || [p.sell]; p.prices[c.li] = c.n; } }); CS.log('Toplu fiyat güncellendi', ps.length + ' ürün'); CS.save(); CS.toast(ps.length + ' ürünün fiyatı güncellendi.'); } }] });
      },
      mass: () => { const v = cf.read(); const ps = CS.db.products.filter((p) => (!v.cat || p.cat === v.cat) && (!v.q || CS.match(p.name, v.q))); CS.confirm(`${ps.length} ürün güncellenecek. Devam edilsin mi?`, () => { ps.forEach((p) => { if (v.newCat) p.cat = v.newCat; if (v.kdv !== '') p.kdv = +v.kdv; if (v.active !== '') p.active = v.active === '1'; if (v.quick !== '') p.quick = v.quick === '1'; }); CS.log('Toplu ürün güncelleme', ps.length + ' ürün'); CS.save(); CS.toast('Güncellendi.'); }, 'Uygula', 'primary'); },
      xls: () => exportProducts(CS.db.products, 'xls'), csv: () => exportProducts(CS.db.products, 'csv'),
      pdf: () => { const byCat = CS.groupBy(CS.db.products.filter((p) => p.active !== false && !p.variants?.length), (p) => CS.categoryName(p.cat) || 'Diğer'); CS.printHTML(`<h1>${esc(CS.db.company.name)} — Fiyat listesi</h1><p class="muted">${CS.date(CS.today())}</p>${Object.entries(byCat).map(([c, ps]) => `<h2>${esc(c)}</h2><table><tr><th>Ürün</th><th>Barkod</th>${CS.db.settings.priceLists.map((n) => `<th class="r">${esc(n)}</th>`).join('')}</tr>${ps.map((p) => `<tr><td>${esc(CS.productName(p))}</td><td>${esc(p.barcode || '')}</td>${CS.db.settings.priceLists.map((n, i) => `<td class="r">${CS.fmt2(i ? p.prices?.[i] || p.sell : p.sell)}</td>`).join('')}</tr>`).join('')}</table>`).join('')}`, 'Fiyat listesi'); }
    });
  }
  function roundP(n, r) { if (!r) return CS.round(n); r = +r; if (r === 0.99) return Math.floor(n) + 0.99; return CS.round(Math.round(n / r) * r); }
  function parseCSV(text) { const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : (text.includes('\t') ? '\t' : ','); const rows = []; let row = [], cell = '', q = false; text = text.replace(/^﻿/, ''); for (let i = 0; i < text.length; i++) { const ch = text[i]; if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; } else if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += ch; } if (cell || row.length) { row.push(cell); rows.push(row); } return rows; }
  CS.parseCSV = parseCSV;
  function exportProducts(ps, kind = 'xls') {
    const cc = CS.canCost(); const pl = CS.db.settings.priceLists;
    const cols = ['Ürün adı', 'Varyant', 'Barkod', 'Stok kodu', 'Kategori', 'Marka', 'Birim', 'Para birimi', ...(cc ? ['Alış fiyatı', 'Alış (₺)', 'Kâr %'] : []), 'Satış fiyatı', 'Satış (₺)', ...[1, 2, 3].flatMap((i) => (cc ? ['Bayi ' + i + ' kâr %'] : []).concat(['Bayi ' + i + ' fiyatı', (pl[i] || 'Bayi ' + i) + ' (₺)'])), 'KDV', 'Kritik stok', 'Stok', ...CS.db.warehouses.map((w) => w.name), 'Alındığı yer', 'Açıklama'];
    const rows = ps.filter((p) => !p.variants?.length).map((p) => { const fx = p.cur && p.cur !== '₺'; const d = p.dealers || []; return [p.name, Object.values(p.attrs || {}).join(' / '), p.barcode || '', p.code || '', CS.categoryName(p.cat), CS.byId('brands', p.brand)?.name || '', p.unit || '', fx ? p.cur : 'TL', ...(cc ? [CS.num(fx ? p.buyFx : p.buy), CS.round(CS.num(p.buy), 2), p.autoPrice ? CS.num(p.margin) : ''] : []), p.autoPrice ? '' : CS.num(fx ? p.sellFx : p.sell), CS.num(p.sell), ...[0, 1, 2].flatMap((i) => (cc ? [d[i]?.m ?? ''] : []).concat([d[i]?.p ?? (fx || p.autoPrice ? '' : CS.num(p.prices?.[i + 1]) || ''), CS.num(p.prices?.[i + 1]) || ''])), p.kdv, CS.num(p.critical), p.service ? '' : CS.stockOf(p), ...CS.db.warehouses.map((w) => CS.stockOf(p, w.id)), CS.byId('sources', p.sourceId)?.name || '', p.desc || '']; });
    kind === 'csv' ? CS.exportCSV('cepstok-urunler', cols, rows) : CS.exportXLS('cepstok-urunler', cols, rows);
  }

  /* ---------- Etiket ---------- */
  function labels(body) {
    const sel = [];
    body.innerHTML = `<div class="grid g2" style="grid-template-columns:1fr 1.4fr"><section class="panel"><h2>Etiket listesi</h2><div class="row"><button class="btn" data-a="add">${icon('plus', 15)} Ürün ekle</button><button class="btn" data-a="crit">Son alış faturasındaki ürünler</button><button class="btn" data-a="changed">Fiyatı değişenler (7 gün)</button></div><div class="row" style="margin-top:8px"><select id="lsrc" aria-label="Alındığı yer"><option value="">Alındığı yere göre ekle…</option>${(CS.db.sources || []).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select><label class="chk" style="padding:0"><input type="checkbox" id="lsc"> Alındığı yer kodunu etikete yaz</label></div><div id="ll" style="margin-top:10px"></div>
      <div class="form-grid" style="margin-top:12px"><label class="fld third"><span>Etiket tipi</span><select id="lt"><option value="barkod">Barkod etiketi</option><option value="raf">Raf fiyat etiketi</option><option value="kucuk">Küçük barkod (yalnız barkod)</option></select></label><label class="fld third"><span>Boyut</span><select id="ls"><option>50x30</option><option>40x25</option><option>60x40</option><option>100x50</option><option>A4 (3x8)</option></select></label><label class="fld third"><span>Fiyat listesi</span><select id="lp">${CS.db.settings.priceLists.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join('')}</select></label></div>
      <p><button class="btn primary" data-a="print">${icon('print', 15)} Yazdır</button></p></section><section class="panel"><h2>Önizleme</h2><div id="lprev" class="label-sheet"></div></section></div>`;
    const draw = () => { $('#ll', body).innerHTML = sel.length ? `<table class="lines">${sel.map((s, i) => `<tr><td>${esc(CS.productName(s.pid))}</td><td class="w-q"><input data-lq="${i}" value="${s.qty}" inputmode="numeric" aria-label="Adet"></td><td><button class="icon-btn danger" data-ldel="${i}" aria-label="Kaldır">${icon('trash', 15)}</button></td></tr>`).join('')}</table>` : '<p class="empty">Etiket basılacak ürünleri ekleyin.</p>'; $('#lprev', body).innerHTML = labelHTML(sel.slice(0, 12).map((s) => ({ ...s, qty: Math.min(s.qty, 2) })), $('#lt', body).value, +$('#lp', body).value); };
    const add = (pid, qty = 1) => { const e = sel.find((s) => s.pid === pid); if (e) e.qty += qty; else sel.push({ pid, qty }); draw(); };
    body.addEventListener('change', (e) => { if (e.target.dataset.lq != null) sel[+e.target.dataset.lq].qty = Math.max(1, CS.num(e.target.value)); if (e.target.id === 'lsrc' && e.target.value) { const ps = CS.db.products.filter((p) => p.sourceId === e.target.value && p.active !== false && !(p.variants || []).length); ps.forEach((p) => add(p.id, Math.max(1, Math.round(CS.stockOf(p)) || 1))); CS.toast(ps.length ? ps.length + ' ürün stok adedi kadar eklendi.' : 'Bu yerden alınmış ürün yok.'); e.target.value = ''; } labelOpts.src = $('#lsc', body).checked; draw(); });
    body.addEventListener('click', (e) => { const d = e.target.closest('[data-ldel]'); if (d) { sel.splice(+d.dataset.ldel, 1); draw(); } });
    CS.bind(body, { add: () => CS.pickProduct((p) => add(p.id), { multi: true }), crit: () => { const d = CS.db.docs.filter((x) => x.type === 'alis').slice(-1)[0]; if (!d) return CS.toast('Alış faturası yok.', 'bad'); d.lines.forEach((l) => l.pid && add(l.pid, Math.round(CS.num(l.qty)))); }, changed: () => { const lim = CS.addDays(CS.today(), -7); CS.db.products.filter((p) => (p.priceHist || []).some((h) => h.at.slice(0, 10) >= lim)).forEach((p) => add(p.id)); if (!sel.length) CS.toast('Son 7 günde fiyatı değişen ürün yok.'); }, print: () => { if (!sel.length) return; printLabels(sel, $('#lt', body).value, $('#ls', body).value, +$('#lp', body).value); } });
    draw();
  }
  const labelOpts = { src: false };
  function labelHTML(sel, type, list) { return sel.flatMap((s) => Array(s.qty).fill(s.pid)).map((pid) => { const p = CS.product(pid) || {}; if (!p.id) return ''; const price = CS.grossPrice(p, list); const sc = labelOpts.src && (CS.byId('sources', p.sourceId) || CS.byId('sources', CS.product(p.parentId)?.sourceId)); const tagSrc = sc ? `<small style="display:block;font-size:8px">${esc(sc.code || sc.name)}</small>` : ''; return type === 'kucuk' ? `<div class="lbl">${CS.barcodeSVG(p.barcode || p.code || p.id)}</div>` : type === 'raf' ? `<div class="lbl" style="text-align:left"><b style="font-size:14px">${esc(CS.productName(p))}</b><div class="p">${CS.fmt2(price)} ₺</div><small>${esc(p.unit || '')} · ${CS.date(CS.today())}${p.unitPriceInfo ? ' · ' + esc(p.unitPriceInfo) : ''}</small><div style="height:26px">${CS.barcodeSVG(p.barcode || p.code || '', 30, false)}</div></div>` : `<div class="lbl"><b>${esc(CS.productName(p))}</b>${CS.barcodeSVG(p.barcode || p.code || p.id)}<div class="p">${CS.fmt2(price)} ₺</div>${tagSrc}</div>`; }).join(''); }
  function printLabels(sel, type, size, list) {
    const a4 = size.startsWith('A4'); const [w, h] = a4 ? [70, 37] : size.split('x').map(Number);
    CS.printHTML(`<div class="sheet">${labelHTML(sel, type, list)}</div>`, 'Etiketler', `body{margin:0}.sheet{display:flex;flex-wrap:wrap;${a4 ? 'width:210mm' : ''}}.lbl{width:${w}mm;height:${h}mm;overflow:hidden;padding:1.5mm;text-align:center;box-sizing:border-box;page-break-inside:avoid;${a4 ? '' : 'page-break-after:always;'}font-family:Arial}.lbl b{display:block;font-size:${h < 30 ? 8 : 10}px;line-height:1.15;max-height:2.4em;overflow:hidden}.lbl svg{width:100%;height:${Math.max(8, h * 0.45)}mm}.p{font-size:${h < 30 ? 12 : 16}px;font-weight:800}@page{${a4 ? 'size:A4;margin:8mm 0' : `size:${w}mm ${h}mm;margin:0`}}`);
  }
  function labelDialog(sel) { CS.modal({ title: 'Etiket yazdır', body: `<div class="form-grid"><label class="fld third"><span>Adet</span><input id="lq" value="1" inputmode="numeric"></label><label class="fld third"><span>Tip</span><select id="lt"><option value="barkod">Barkod etiketi</option><option value="raf">Raf etiketi</option><option value="kucuk">Yalnız barkod</option></select></label><label class="fld third"><span>Boyut</span><select id="ls"><option>50x30</option><option>40x25</option><option>60x40</option><option>A4 (3x8)</option></select></label></div><div class="label-sheet" style="margin-top:12px">${labelHTML(sel, 'barkod', 0)}</div>`, buttons: [{ label: 'Vazgeç' }, { label: 'Yazdır', kind: 'primary', onClick: (c, el) => printLabels(sel.map((s) => ({ ...s, qty: Math.max(1, CS.num($('#lq', el).value)) })), $('#lt', el).value, $('#ls', el).value, 0) }] }); }
  CS.labelDialog = labelDialog;

  function costs(body) {
    const rows = CS.db.products.flatMap((p) => (p.costHist || []).map((h) => ({ p, ...h }))).sort((a, b) => b.at.localeCompare(a.at));
    body.innerHTML = `<p class="muted">Stokta bulunan ürüne farklı fiyattan alış yapıldığında maliyet ${CS.db.settings.costMethod === 'son' ? 'son alış fiyatına' : 'ağırlıklı ortalamaya'} göre güncellenir; kâr marjlı fiyatlar yeniden hesaplanır. Yöntemi Ayarlar > Genel bölümünden değiştirebilirsiniz.</p><div id="ch"></div>`;
    CS.table($('#ch', body), { rows, empty: 'Henüz maliyet değişimi yok.', cols: [{ l: 'Tarih', k: 'at', f: (r) => CS.dateTime(r.at) }, { l: 'Ürün', v: (r) => CS.productName(r.p) }, { l: 'Belge', k: 'doc' }, { l: 'Önceki stok', a: 'r', v: (r) => r.have, f: (r) => CS.qty(r.have) }, { l: 'Alınan', a: 'r', v: (r) => r.qty, f: (r) => CS.qty(r.qty) }, { l: 'Alış fiyatı', a: 'r', v: (r) => r.unit, f: (r) => CS.fxMoney(r.unit, r.p.cur) }, { l: 'Eski maliyet', a: 'r', v: (r) => r.old, f: (r) => CS.fxMoney(r.old, r.p.cur) }, { l: 'Yeni maliyet', a: 'r', v: (r) => r.new, f: (r) => `<b>${CS.fxMoney(r.new, r.p.cur)}</b> <small>${r.method === 'son' ? 'son alış' : 'ortalama'}</small>` }, { l: 'Değişim', a: 'r', v: (r) => (r.old ? (r.new - r.old) / r.old : 0), f: (r) => (r.old ? `<span class="${r.new > r.old ? 'neg' : 'pos'}">%${CS.fmt2(((r.new - r.old) / r.old) * 100)}</span>` : '') }], onRow: (r) => CS.go('products/' + r.p.id) });
  }
  function sources(body) {
    CS.db.sources = CS.db.sources || [];
    body.innerHTML = `<p>${CS.can('products', 'e') ? CS.btn('Yer ekle', 'n', 'primary', 'plus') : ''}</p><p class="muted">Ürünleri nereden aldığınızı kaydedin (toptancı, ithalatçı, pazar, fuar…). Her yerin kodu, “Barkod üret” dediğinizde barkodun içine yazılır (20 + yer kodu + sıra); etiket ekranında bir yerden alınan tüm ürünlerin barkodlarını tek seferde basabilirsiniz.</p><div id="st"></div>`;
    const edit = (x) => { const f = CS.form([{ k: 'name', l: 'Yer adı', req: true }, { k: 'code', l: 'Kod (3 hane)', req: true, def: String(CS.db.sources.length + 1).padStart(3, '0') }, { k: 'cid', l: 'Bağlı tedarikçi carisi', t: 'select', opts: CS.contactOptions('tedarikci', '— Yok —') }, { k: 'phone', l: 'Telefon' }, { k: 'address', l: 'Adres', w: 'full' }, { k: 'note', l: 'Not', w: 'full' }], x || {}); CS.modal({ title: x ? 'Alındığı yer' : 'Yeni alındığı yer', body: f, buttons: [...(x ? [{ label: 'Sil', kind: 'danger', onClick: () => { CS.db.sources = CS.db.sources.filter((y) => y !== x); CS.save(); CS.route(); } }] : []), { label: 'Vazgeç' }, { label: 'Kaydet', kind: 'primary', onClick: () => { const v = f.read(); if (!v) return false; v.code = String(v.code).replace(/\D/g, '').padStart(3, '0').slice(-3); if (CS.db.sources.some((y) => y !== x && y.code === v.code)) { CS.toast('Bu kod başka bir yerde kullanılıyor.', 'bad'); return false; } if (x) Object.assign(x, v); else CS.db.sources.push({ id: 'src_' + CS.uid(), ...v }); CS.save(); CS.route(); } }] }); };
    CS.bind(body, { n: () => edit() });
    CS.table($('#st', body), { rows: CS.db.sources, empty: 'Henüz kayıt yok.', cols: [{ l: 'Yer', k: 'name', f: (x) => `<b>${esc(x.name)}</b><small>${esc(x.address || '')}</small>` }, { l: 'Kod', k: 'code' }, { l: 'Tedarikçi', v: (x) => CS.contactName(x.cid) }, { l: 'Ürün', a: 'r', v: (x) => CS.db.products.filter((p) => p.sourceId === x.id).length }, { l: 'Stok adedi', a: 'r', v: (x) => CS.sum(CS.db.products.filter((p) => p.sourceId === x.id && !(p.variants || []).length), (p) => Math.max(0, CS.stockOf(p))), f: (x) => CS.qty(CS.sum(CS.db.products.filter((p) => p.sourceId === x.id && !(p.variants || []).length), (p) => Math.max(0, CS.stockOf(p)))) }], onRow: (x) => CS.go('products?src=' + x.id), actions: () => CS.actBtn('edit', 'Düzenle', 'edit') + CS.actBtn('lbl', 'Etiket bas', 'tag'), onAct: (a, x) => { if (a === 'edit') edit(x); if (a === 'lbl') labelDialog(CS.db.products.filter((p) => p.sourceId === x.id && !(p.variants || []).length).map((p) => ({ pid: p.id, qty: 1 }))); } });
  }
  function prices(body) {
    const rows = CS.db.products.flatMap((p) => (p.priceHist || []).map((h) => ({ p, ...h }))).sort((a, b) => b.at.localeCompare(a.at));
    body.innerHTML = '<div id="ph"></div>';
    CS.table($('#ph', body), { rows, empty: 'Henüz fiyat değişikliği yok.', cols: [{ l: 'Tarih', k: 'at', f: (r) => CS.dateTime(r.at) }, { l: 'Ürün', v: (r) => CS.productName(r.p) }, { l: 'Alan', v: (r) => (r.field ? ({ sell: 'Satış', buy: 'Alış', fromBuy: 'Satış (alıştan)' })[r.field] || 'Fiyat listesi' : 'Satış / alış') }, { l: 'Eski', a: 'r', f: (r) => CS.fmt2(r.old ?? r.sellOld) + (r.buyOld != null ? ` <small>alış ${CS.fmt2(r.buyOld)}</small>` : '') }, { l: 'Yeni', a: 'r', f: (r) => `<b>${CS.fmt2(r.new ?? r.sellNew)}</b>` + (r.buyNew != null ? ` <small>alış ${CS.fmt2(r.buyNew)}</small>` : '') }, { l: 'Kullanıcı', k: 'user' }] });
  }

  /* ---------- Hazır ürün kütüphanesi ---------- */
  function libraryDialog() {
    const m = CS.modal({ title: 'Hazır ürün kütüphanesi', size: 'lg', body: `<p class="muted">Barkod ya da ad ile arayın, işaretlediklerinizi tek seferde ürünlerinize ekleyin. Kütüphanede olmayan ürünlerde barkodu okutup kendiniz tanımlayabilirsiniz.</p><input id="lq" type="search" placeholder="Barkod ya da ürün adı" style="width:100%;margin-bottom:8px"><div id="lr" class="pick-list"></div>`, buttons: [{ label: 'Vazgeç' }, { label: 'Seçilenleri ekle', kind: 'primary', onClick: (c, el) => { const ids = $$('input[data-lib]:checked', el).map((i) => i.dataset.lib); let n = 0; ids.forEach((code) => { const r = CS.LIBRARY.find((x) => x[0] === code); if (CS.findByBarcode(code)) return; let cat = CS.db.categories.find((c2) => c2.name === r[2])?.id; if (!cat) { cat = 'cat_' + CS.uid(); CS.db.categories.push({ id: cat, name: r[2] }); } CS.db.products.push({ id: 'p_' + CS.uid(), name: r[1], barcode: r[0], cat, unit: r[3], buy: r[4], sell: r[5], kdv: 1, active: true, stock: {} }); n++; }); CS.save(); CS.toast(n + ' ürün eklendi.'); CS.route(); } }] });
    const draw = () => { const q = $('#lq', m.el).value; $('#lr', m.el).innerHTML = CS.LIBRARY.filter((r) => !q || CS.match(r[0] + ' ' + r[1], q)).map((r) => `<label class="pick-row"><span><input type="checkbox" data-lib="${r[0]}" ${CS.findByBarcode(r[0]) ? 'disabled' : ''}> <b>${esc(r[1])}</b><small>${r[0]} · ${esc(r[2])}${CS.findByBarcode(r[0]) ? ' · zaten kayıtlı' : ''}</small></span><span class="r">${CS.fmt2(r[5])} ₺</span></label>`).join(''); };
    $('#lq', m.el).oninput = draw; draw();
  }
})();
