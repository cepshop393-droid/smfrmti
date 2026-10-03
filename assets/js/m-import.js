/* Excel'den veri al — her türlü Excel/CSV tablosunu sütun eşleştirerek içe aktarır */
(function () {
  const { $, $$, esc, icon } = CS;
  const norm = (s) => CS.trLower(String(s ?? '')).replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g').replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c').replace(/[âà]/g, 'a').replace(/[^a-z0-9%]+/g, ' ').trim();
  const F = (k, l, syn, req) => ({ k, l, syn: [l].concat(syn || []).map(norm), req: !!req });
  const KEYS = [F('barcode', 'Barkod', ['barcode', 'ean', 'gtin', 'barkod no', 'barkodu']), F('code', 'Stok kodu', ['urun kodu', 'kod', 'sku', 'code', 'stok no', 'malzeme kodu']), F('name', 'Ürün adı', ['urun', 'stok adi', 'malzeme', 'malzeme adi', 'ad', 'adi', 'isim', 'product', 'name', 'urun ismi', 'aciklama'])];
  const PRICE = [F('cur', 'Para birimi', ['doviz', 'currency', 'pb', 'doviz cinsi']), F('buy', 'Alış fiyatı', ['alis', 'maliyet', 'gelis fiyati', 'cost', 'alis fiyat', 'alis tutari']), F('margin', 'Kâr %', ['kar', 'kar orani', 'kar marji', 'marj', 'kar yuzdesi']), F('sell', 'Satış fiyatı', ['satis', 'fiyat', 'perakende', 'perakende fiyati', 'price', 'etiket fiyati', 'liste fiyati']), F('dm1', 'Bayi 1 kâr %', []), F('dp1', 'Bayi 1 fiyatı', ['bayi 1', 'bayi1', 'bayi fiyati', 'toptan', 'toptan fiyati']), F('dm2', 'Bayi 2 kâr %', []), F('dp2', 'Bayi 2 fiyatı', ['bayi 2', 'bayi2']), F('dm3', 'Bayi 3 kâr %', []), F('dp3', 'Bayi 3 fiyatı', ['bayi 3', 'bayi3'])];
  const CARI = [F('cname', 'Cari adı', ['cari', 'musteri', 'firma', 'unvan', 'musteri adi', 'tedarikci', 'bayi', 'cari unvan', 'hesap adi']), F('ctax', 'Vergi / TC no', ['vkn', 'vergi no', 'tckn', 'tc', 'vergi numarasi'])];

  const TARGETS = {
    products: { label: 'Ürünler', perm: 'products', icon: 'box', desc: 'Ürün kartları, barkod, kategori, döviz, alış/satış ve 3 bayi fiyatı, stok', fields: [...KEYS.map((f, i) => (i === 2 ? { ...f, req: false } : f)), F('category', 'Kategori', ['grup', 'category', 'urun grubu', 'kategori adi']), F('brand', 'Marka', ['brand', 'uretici']), F('unit', 'Birim', ['unit', 'olcu birimi']), ...PRICE, F('kdv', 'KDV', ['kdv %', 'vergi', 'tax', 'kdv orani']), F('critical', 'Kritik stok', ['min stok', 'minimum stok', 'kritik']), F('stock', 'Stok', ['miktar', 'adet', 'stok miktari', 'mevcut', 'qty', 'quantity', 'eldeki']), F('warehouse', 'Depo', ['warehouse', 'sube']), F('source', 'Alındığı yer', ['alis yeri', 'nereden', 'tedarikci']), F('desc', 'Açıklama', ['not', 'description'])],
      opts: [{ k: 'mode', l: 'Kayıt biçimi', t: 'select', opts: [['upsert', 'Varsa güncelle, yoksa ekle'], ['new', 'Yalnızca yeni ürünleri ekle'], ['update', 'Yalnızca mevcutları güncelle']] }, { k: 'stockMode', l: 'Stok sütunu', t: 'select', opts: [['set', 'Depodaki miktarı bu sayıya eşitle'], ['add', 'Mevcut stoğa ekle']] }, { k: 'wh', l: 'Depo (sütunda yoksa)', t: 'select', opts: () => CS.whOptions() }],
      validate: (o) => (!o.name && !o.barcode && !o.code ? 'Ürün adı, barkod ya da stok kodu gerekli' : ''),
      run: (rows, op) => { const r = CS.importProducts(rows, op); return { ok: r.n + r.u, msg: `${r.n} ürün eklendi, ${r.u} ürün güncellendi`, errors: r.errors }; } },
    prices: { label: 'Fiyat güncelleme', perm: 'products', icon: 'tag', desc: 'Barkod ya da stok koduna göre alış, satış, kâr ve bayi fiyatlarını günceller', fields: [...KEYS, ...PRICE], validate: (o) => (!o.barcode && !o.code && !o.name ? 'Barkod ya da stok kodu gerekli' : ''),
      run: (rows) => { const r = CS.importProducts(rows.map((o) => ({ ...o, stock: undefined })), { mode: 'update' }); return { ok: r.u, msg: `${r.u} ürünün fiyatı güncellendi`, errors: r.errors }; } },
    stock: { label: 'Stok miktarları / sayım', perm: 'stock', icon: 'layers', desc: 'Barkod ve adet listesinden stok girişi ya da sayım sonucu', fields: [...KEYS, F('qty', 'Miktar', ['stok', 'adet', 'miktar', 'sayilan', 'qty', 'quantity'], true), F('unitCost', 'Birim alış fiyatı', ['alis fiyati', 'maliyet', 'birim fiyat']), F('warehouse', 'Depo', ['sube'])],
      opts: [{ k: 'stockMode', l: 'İşlem', t: 'select', opts: [['set', 'Sayım: depodaki miktarı eşitle'], ['add', 'Stok girişi: miktarı ekle']] }, { k: 'wh', l: 'Depo (sütunda yoksa)', t: 'select', opts: () => CS.whOptions() }],
      validate: (o) => (!o.barcode && !o.code && !o.name ? 'Ürün bilgisi yok' : o.qty === '' || o.qty == null ? 'Miktar boş' : ''),
      run: (rows, op) => { let ok = 0; const errors = []; CS.costChanges = [];
        rows.forEach((o, i) => { const p = findProduct(o); if (!p) return errors.push([i + 1, 'Ürün bulunamadı: ' + (o.barcode || o.code || o.name)]); let wh = op.wh || CS.defaultWh(); if (o.warehouse) { const w = CS.db.warehouses.find((x) => CS.trLower(x.name) === CS.trLower(o.warehouse)); if (w) wh = w.id; } const q = CS.num(o.qty); const diff = op.stockMode === 'add' ? q : q - CS.stockOf(p, wh); if (!diff) { ok++; return; } if (diff > 0 && CS.num(o.unitCost) && CS.canCost()) CS.updateCost(p, diff, CS.num(o.unitCost), { no: 'Excel stok girişi' }); CS.addMove({ pid: p.id, wh, qty: diff, type: op.stockMode === 'add' ? 'duzelt' : 'sayim', ref: 'xls_' + CS.today(), note: op.stockMode === 'add' ? 'Excel stok girişi' : 'Excel sayım', cost: CS.num(o.unitCost) || CS.num(p.buy) }); ok++; });
        CS.log('Excel stok aktarımı', ok + ' ürün'); CS.save(); if (CS.costChanges.length) setTimeout(() => CS.costChangeDialog(CS.costChanges.slice()), 300); return { ok, msg: `${ok} ürünün stoğu işlendi`, errors }; } },
    contacts: { label: 'Cariler ve bayiler', perm: 'contacts', icon: 'users', desc: 'Müşteri, tedarikçi ve bayi kartları, açılış bakiyeleri, konum', fields: [F('name', 'Cari adı', ['cari', 'musteri', 'musteri adi', 'firma', 'firma adi', 'ad soyad', 'adi', 'isim', 'kisa ad'], true), F('title', 'Ünvan', ['ticari unvan', 'unvani']), F('kind', 'Türü', ['tur', 'tip', 'cari turu', 'grup']), F('taxNo', 'Vergi no', ['vkn', 'vergi numarasi', 'vergi no tckn']), F('tc', 'TC kimlik no', ['tc', 'tckn', 'kimlik no']), F('taxOffice', 'Vergi dairesi', ['vd', 'v d']), F('phone', 'Telefon', ['tel', 'gsm', 'cep', 'cep telefonu', 'telefon no']), F('email', 'E-posta', ['email', 'mail', 'e mail']), F('address', 'Adres', ['acik adres']), F('district', 'İlçe', []), F('city', 'İl', ['sehir', 'il adi']), F('category', 'Kategori', ['cari grubu']), F('priceList', 'Fiyat listesi', ['bayi seviyesi', 'fiyat grubu', 'liste']), F('balance', 'Bakiye', ['acilis bakiyesi', 'devir', 'borc bakiye', 'bakiye tutari']), F('due', 'Vade (gün)', ['vade', 'vade gunu']), F('limit', 'Risk limiti', ['limit', 'kredi limiti']), F('iban', 'IBAN', []), F('lat', 'Enlem', ['latitude', 'lat']), F('lng', 'Boylam', ['longitude', 'lng', 'lon']), F('note', 'Not', ['aciklama', 'notlar'])],
      opts: [{ k: 'kind', l: 'Türü sütunu yoksa', t: 'select', opts: [['musteri', 'Müşteri'], ['tedarikci', 'Tedarikçi'], ['bayi', 'Bayi']] }, { k: 'bal', l: 'Bakiye sütunu', t: 'select', opts: [['new', 'Yalnızca yeni carilere açılış bakiyesi yaz'], ['sync', 'Cari bakiyesini bu tutara eşitle (fark kaydı)'], ['none', 'Bakiyeyi alma']] }],
      validate: (o) => (!o.name ? 'Cari adı boş' : ''), run: importContacts },
    balances: { label: 'Cari bakiyeleri / devir', perm: 'contacts', icon: 'wallet', desc: 'Eski programdan cari borç-alacak bakiyelerini devralır', fields: [...CARI.map((f, i) => (i === 0 ? { ...f, req: true } : f)), F('amount', 'Tutar', ['bakiye', 'borc', 'tutar', 'meblag'], true), F('dir', 'Borç / alacak', ['b a', 'yon', 'durum', 'borc alacak']), F('date', 'Tarih', []), F('desc', 'Açıklama', [])],
      opts: [{ k: 'sign', l: 'Yön sütunu yoksa', t: 'select', opts: [['pos', 'Pozitif tutar = cari bize borçlu'], ['neg', 'Pozitif tutar = biz cariye borçluyuz']] }, { k: 'create', l: 'Bulunamayan cari', t: 'select', opts: [['yes', 'Yeni cari olarak oluştur'], ['no', 'Atla']] }],
      validate: (o) => (!o.cname && !o.ctax ? 'Cari bilgisi yok' : o.amount === '' ? 'Tutar boş' : ''), run: importBalances },
    cash: { label: 'Kasa / banka hareketleri', perm: 'finance', icon: 'cheque', desc: 'Gelir, gider, tahsilat ve ödeme listeleri (banka ekstresi dahil)', fields: [F('date', 'Tarih', ['islem tarihi', 'valor'], true), F('desc', 'Açıklama', ['aciklama', 'islem', 'detay']), F('amount', 'Tutar', ['meblag', 'tutar tl'], false), F('in', 'Giriş', ['alacak', 'gelen', 'tahsilat', 'yatan']), F('out', 'Çıkış', ['borc', 'giden', 'odeme', 'cekilen']), F('category', 'Kategori', ['gider turu', 'masraf turu']), F('account', 'Hesap', ['kasa', 'banka', 'hesap adi']), ...CARI],
      opts: [{ k: 'acc', l: 'Hesap (sütunda yoksa)', t: 'select', opts: () => CS.accOptions(null) }],
      validate: (o) => (!o.date ? 'Tarih boş' : o.amount === '' && o.in === '' && o.out === '' && o.amount == null ? 'Tutar boş' : ''), run: importCash },
    docs: { label: 'Geçmiş satış / alış faturaları', perm: 'docs', icon: 'file', desc: 'Satır satır fatura listesi; aynı belge numaralı satırlar tek belgede birleşir', fields: [F('no', 'Belge no', ['fatura no', 'fis no', 'evrak no', 'belge numarasi'], false), F('date', 'Tarih', ['fatura tarihi', 'belge tarihi'], true), ...CARI, ...KEYS, F('qty', 'Miktar', ['adet', 'miktar'], true), F('price', 'Birim fiyat', ['fiyat', 'birim fiyati', 'tutar'], true), F('kdv', 'KDV', ['kdv %', 'kdv orani']), F('disc', 'İskonto %', ['iskonto', 'indirim']), F('due', 'Vade tarihi', ['vade'])],
      opts: [{ k: 'type', l: 'Belge türü', t: 'select', opts: [['satis', 'Satış faturası'], ['alis', 'Alış faturası'], ['satis_iade', 'Satış iade'], ['alis_iade', 'Alış iade']] }, { k: 'incl', l: 'Fiyatlar', t: 'select', opts: [['excl', 'KDV hariç'], ['incl', 'KDV dahil']] }, { k: 'stock', l: 'Stok', t: 'select', opts: [['no', 'Stoğu etkilemesin (geçmiş kayıt)'], ['yes', 'Stoğu etkilesin']] }, { k: 'wh', l: 'Depo', t: 'select', opts: () => CS.whOptions() }],
      validate: (o) => (!o.date ? 'Tarih boş' : !o.qty ? 'Miktar boş' : ''), run: importDocs }
  };

  /* ---------- Yardımcılar ---------- */
  function findProduct(o) { const bc = o.barcode ? String(o.barcode).replace(/\.0+$/, '').trim() : ''; return (bc && CS.findByBarcode(bc)) || (o.code && CS.db.products.find((p) => p.code === String(o.code).trim())) || (o.name && CS.db.products.find((p) => CS.trLower(CS.productName(p)) === CS.trLower(o.name) || CS.trLower(p.name) === CS.trLower(o.name))) || null; }
  function findContact(o, create, kind) {
    const tax = String(o.ctax || o.taxNo || o.tc || '').replace(/\D/g, ''); const nm = o.cname || o.name;
    let c = (tax && CS.db.contacts.find((x) => x.taxNo === tax || x.tc === tax)) || (nm && CS.db.contacts.find((x) => CS.trLower(x.name) === CS.trLower(nm) || CS.trLower(x.title || '') === CS.trLower(nm)));
    if (!c && create && nm) { c = { id: 'c_' + CS.uid(), name: String(nm).trim(), kind: kind || 'musteri', createdAt: CS.today(), priceList: 0, ...(tax.length === 11 ? { tc: tax } : tax ? { taxNo: tax } : {}) }; CS.db.contacts.push(c); }
    return c;
  }
  CS.parseDate = function (v) {
    if (v == null || v === '') return ''; if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10); }
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
    const s = String(v).trim(); let m;
    if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    if ((m = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return '';
  };
  function importContacts(rows, op) {
    let n = 0, u = 0; const errors = [];
    rows.forEach((o, i) => {
      const tax = String(o.taxNo || '').replace(/\D/g, ''), tc = String(o.tc || '').replace(/\D/g, '');
      let c = (tax && CS.db.contacts.find((x) => x.taxNo === tax)) || (tc && CS.db.contacts.find((x) => x.tc === tc)) || CS.db.contacts.find((x) => CS.trLower(x.name) === CS.trLower(o.name));
      const isNew = !c; if (!c) { c = { id: 'c_' + CS.uid(), createdAt: CS.today(), priceList: 0, kind: 'musteri' }; CS.db.contacts.push(c); n++; } else u++;
      const kd = CS.trLower(o.kind || (isNew ? op.kind : '') || '');
      if (kd) { if (/tedarik|satic|supplier/.test(kd)) c.kind = 'tedarikci'; else if (/her ikisi|ikisi|both/.test(kd)) c.kind = 'both'; else { c.kind = 'musteri'; if (/bayi|dealer/.test(kd)) { c.dealer = true; if (!c.priceList) c.priceList = 1; } } }
      const set = (k, v) => { if (v !== undefined && v !== null && String(v).trim() !== '') c[k] = typeof v === 'string' ? v.trim() : v; };
      set('name', o.name); set('title', o.title); if (tax) c.taxNo = tax; if (tc) c.tc = tc; set('taxOffice', o.taxOffice); set('phone', o.phone != null ? String(o.phone) : ''); set('email', o.email); set('address', o.address); set('district', o.district); set('city', o.city); set('category', o.category); set('iban', o.iban); set('note', o.note);
      if (o.due !== '' && o.due != null) c.due = CS.num(o.due); if (o.limit !== '' && o.limit != null) c.limit = CS.num(o.limit);
      if (o.lat && o.lng) { c.lat = CS.num(o.lat); c.lng = CS.num(o.lng); }
      if (o.priceList !== '' && o.priceList != null) { const pl = CS.db.settings.priceLists; const t = String(o.priceList).trim(); const ix = pl.findIndex((x) => CS.trLower(x) === CS.trLower(t)); c.priceList = ix >= 0 ? ix : Math.max(0, Math.min(pl.length - 1, CS.num(t))); if (c.priceList > 0 && /bayi/i.test(pl[c.priceList] || '')) c.dealer = true; }
      if (c.category && !CS.db.contactCats.includes(c.category)) CS.db.contactCats.push(c.category);
      if (o.balance !== '' && o.balance != null && op.bal !== 'none') { const b = CS.num(o.balance); if (isNew && op.bal === 'new' && b) CS.addLedger({ cid: c.id, amt: b, desc: 'Açılış bakiyesi (Excel)', ref: 'open_' + c.id, kind: 'devir' }); if (op.bal === 'sync') { const d = CS.round(b - CS.balance(c.id)); if (Math.abs(d) > 0.005) CS.addLedger({ cid: c.id, amt: d, desc: 'Bakiye eşitleme (Excel)', ref: 'fix_' + CS.uid(), kind: 'duzeltme' }); } }
    });
    CS.log('Excel ile cari aktarıldı', `${n} yeni, ${u} güncelleme`); CS.save(); return { ok: n + u, msg: `${n} cari eklendi, ${u} cari güncellendi`, errors };
  }
  function importBalances(rows, op) {
    let ok = 0; const errors = [];
    rows.forEach((o, i) => {
      const c = findContact(o, op.create === 'yes'); if (!c) return errors.push([i + 1, 'Cari bulunamadı: ' + (o.cname || o.ctax)]);
      let a = CS.num(o.amount); const d = CS.trLower(o.dir || ''); if (d) { if (/^a|alacak|cr/.test(d)) a = -Math.abs(a); else if (/^b|borc|dr/.test(d)) a = Math.abs(a); } else if (op.sign === 'neg') a = -a;
      if (!a) return; CS.addLedger({ cid: c.id, amt: a, date: CS.parseDate(o.date) || CS.today(), desc: o.desc || 'Devir bakiyesi (Excel)', ref: 'dev_' + CS.uid(), kind: 'devir' }); ok++;
    });
    CS.log('Excel ile cari bakiye aktarıldı', ok + ' kayıt'); CS.save(); return { ok, msg: `${ok} cari bakiyesi işlendi`, errors };
  }
  function importCash(rows, op) {
    let ok = 0; const errors = [];
    rows.forEach((o, i) => {
      const date = CS.parseDate(o.date); if (!date) return errors.push([i + 1, 'Tarih okunamadı: ' + o.date]);
      let amt = o.amount !== '' && o.amount != null ? CS.num(o.amount) : CS.num(o.in) - Math.abs(CS.num(o.out)); if (!amt) return errors.push([i + 1, 'Tutar sıfır']);
      let acc = op.acc; if (o.account) { const a = CS.db.accounts.find((x) => CS.trLower(x.name) === CS.trLower(o.account)); if (a) acc = a.id; }
      if (!acc) return errors.push([i + 1, 'Hesap yok']);
      const c = (o.cname || o.ctax) ? findContact(o, false) : null;
      if (c) CS.payment({ dir: amt > 0 ? 'in' : 'out', cid: c.id, accId: acc, amount: Math.abs(amt), date, desc: o.desc || (amt > 0 ? 'Tahsilat (Excel)' : 'Ödeme (Excel)'), method: 'havale' });
      else CS.addAccMove({ accId: acc, amt, date, desc: o.desc || 'Excel hareketi', kind: amt > 0 ? 'gelir' : 'gider', category: o.category || (amt > 0 ? 'Diğer gelir' : 'Diğer') });
      ok++;
    });
    CS.log('Excel ile kasa/banka aktarıldı', ok + ' hareket'); CS.save(); return { ok, msg: `${ok} hareket işlendi`, errors };
  }
  function importDocs(rows, op) {
    const errors = []; const groups = new Map();
    rows.forEach((o, i) => { const date = CS.parseDate(o.date); if (!date) return errors.push([i + 1, 'Tarih okunamadı']); const k = o.no ? 'n:' + o.no : 'd:' + date + '|' + (o.cname || o.ctax || ''); if (!groups.has(k)) groups.set(k, { o, date, lines: [] }); const p = findProduct(o); const kdv = o.kdv !== '' && o.kdv != null ? CS.num(String(o.kdv).replace('%', '')) : p ? CS.num(p.kdv) : CS.db.settings.defaultKdv; let price = CS.num(o.price); if (op.incl === 'incl') price = price / (1 + kdv / 100); groups.get(k).lines.push({ pid: p?.id || '', name: p ? CS.productName(p) : o.name || o.barcode || o.code || 'Satır', qty: CS.num(o.qty), unit: p?.unit || 'Adet', price: CS.round(price, 6), kdv, disc: CS.num(o.disc) }); });
    let ok = 0;
    groups.forEach((g) => { const c = (g.o.cname || g.o.ctax) ? findContact(g.o, true, CS.DOC_TYPES[op.type].side === 'buy' ? 'tedarikci' : 'musteri') : null; if (!c) { errors.push(['—', 'Cari bilgisi olmayan belge atlandı']); return; } CS.postDoc({ type: op.type, date: g.date, due: CS.parseDate(g.o.due) || '', cid: c.id, wh: op.wh, lines: g.lines, currency: '₺', rate: 1, status: 'onay', edoc: 'kagit', eno: g.o.no ? String(g.o.no) : '', noStock: op.stock !== 'yes', desc: 'Excel aktarımı' + (g.o.no ? ' — ' + g.o.no : '') }); ok++; });
    return { ok, msg: `${ok} belge oluşturuldu`, errors };
  }

  /* ---------- Ekran ---------- */
  CS.mod('import', {
    title: 'Excel’den veri al', perm: 'dashboard',
    render(page, prm) {
      const body = CS.head(page, 'Excel’den veri al', '<a class="btn" href="#settings/backup">Dışa aktarım ve yedek</a>');
      let target = prm.t && TARGETS[prm.t] ? prm.t : null; let wb = null, sheet = null, grid = [], hdr = 0, map = {};
      const allowed = Object.entries(TARGETS).filter(([k, t]) => CS.can(t.perm, 'e'));
      const step1 = () => {
        body.innerHTML = `<p class="muted" style="max-width:75ch">Excel (.xlsx, .xls), LibreOffice (.ods) ya da CSV dosyanızı yükleyin. Sütun başlıkları farklı olsa da program eşleştirir; yanlış eşleşeni siz düzeltirsiniz. Eski programınızdan aldığınız listeleri doğrudan kullanabilirsiniz.</p><h2 style="font-size:17px">1. Neyi aktaracaksınız?</h2><div class="int-grid">${allowed.map(([k, t]) => `<button class="int" data-t="${k}" style="text-align:left;cursor:pointer;${k === target ? 'border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)' : ''}"><b>${icon(t.icon, 16)} ${esc(t.label)}</b><p>${esc(t.desc)}</p></button>`).join('')}</div><div id="s2"></div>`;
        body.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { target = b.dataset.t; step1(); }));
        if (target) step2();
      };
      const step2 = () => {
        const T = TARGETS[target]; const s2 = $('#s2', body);
        s2.innerHTML = `<h2 style="font-size:17px;margin-top:22px">2. Dosyayı seçin</h2><div class="drop" id="drop">${icon('upload', 22)}<br>Excel dosyasını buraya sürükleyin ya da <label class="btn sm">dosya seçin<input type="file" id="xf" accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt" hidden></label><br><small>veya Excel’de hücreleri kopyalayıp <button class="btn sm" type="button" id="paste">yapıştırın</button></small></div><p><button class="btn sm" id="tpl">${icon('down', 15)} ${esc(T.label)} için örnek Excel şablonu</button></p><div id="s3"></div>`;
        const drop = $('#drop', s2); drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over'); drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); readFile(e.dataTransfer.files[0]); };
        $('#xf', s2).onchange = (e) => readFile(e.target.files[0]);
        $('#paste', s2).onclick = () => CS.modal({ title: 'Excel’den yapıştır', body: '<p class="muted">Başlık satırıyla birlikte hücreleri kopyalayıp yapıştırın.</p><textarea id="pt" rows="10" style="width:100%"></textarea>', buttons: [{ label: 'Vazgeç' }, { label: 'Devam', kind: 'primary', onClick: (c, el) => { wb = null; grid = $('#pt', el).value.split(/\r?\n/).map((l) => l.split('\t')); afterRead('Yapıştırılan veri'); } }] });
        $('#tpl', s2).onclick = () => CS.exportXLS('cepstok-' + target + '-sablon', T.fields.map((f) => f.l), [T.fields.map(() => '')]);
      };
      const readFile = (file) => {
        if (!file) return; const name = file.name || '';
        if (/\.(csv|txt)$/i.test(name)) { const r = new FileReader(); r.onload = () => { wb = null; grid = CS.parseCSV(String(r.result)); afterRead(name); }; r.readAsText(file, 'utf-8'); return; }
        if (!window.XLSX) { CS.toast('Excel okuyucu yüklenemedi. Sayfayı yenileyin ya da dosyayı CSV olarak kaydedin.', 'bad', 5000); return; }
        const r = new FileReader(); r.onload = () => { try { wb = XLSX.read(r.result, { type: 'array' }); sheet = wb.SheetNames.find((n) => { const ws = wb.Sheets[n]; return ws['!ref']; }) || wb.SheetNames[0]; loadSheet(); afterRead(name); } catch (e) { CS.toast('Dosya okunamadı: ' + e.message, 'bad', 5000); } }; r.readAsArrayBuffer(file);
      };
      const loadSheet = () => { grid = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: '' }); };
      const afterRead = (fname) => {
        grid = grid.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));
        if (!grid.length) { CS.toast('Dosyada veri bulunamadı.', 'bad'); return; }
        // başlık satırını bul: en çok yazı içeren ilk satırlardan biri
        let best = 0, score = -1; grid.slice(0, 15).forEach((r, i) => { const sc = r.filter((c) => typeof c === 'string' && c.trim() && isNaN(CS.num(c) || NaN)).length; if (sc > score) { score = sc; best = i; } }); hdr = best;
        guess(); step3(fname);
      };
      const cols = () => (grid[hdr] || []).map((h, i) => ({ i, h: String(h ?? '').trim() || 'Sütun ' + String.fromCharCode(65 + (i % 26)) }));
      const guess = () => {
        const T = TARGETS[target]; map = {}; const used = new Set(); const C = cols().map((c) => ({ ...c, n: norm(c.h) }));
        T.fields.forEach((f) => { const hit = C.find((c) => !used.has(c.i) && f.syn.includes(c.n)); if (hit) { map[f.k] = hit.i; used.add(hit.i); } });
        T.fields.forEach((f) => { if (map[f.k] != null) return; const hit = C.find((c) => !used.has(c.i) && c.n && f.syn.some((s) => s.length > 2 && (c.n.startsWith(s) || (s.length > 4 && c.n.includes(s))))); if (hit) { map[f.k] = hit.i; used.add(hit.i); } });
      };
      const rowsMapped = () => grid.slice(hdr + 1).map((r) => { const o = {}; TARGETS[target].fields.forEach((f) => { const i = map[f.k]; let v = i == null ? '' : r[i]; if (v instanceof Date || (['date', 'due'].includes(f.k) && v !== '')) v = CS.parseDate(v) || v; o[f.k] = typeof v === 'string' ? v.trim() : v ?? ''; }); return o; }).filter((o) => Object.values(o).some((v) => String(v).trim() !== ''));
      const step3 = (fname) => {
        const T = TARGETS[target]; const s3 = $('#s3', body); const C = cols();
        s3.innerHTML = `<h2 style="font-size:17px;margin-top:22px">3. Sütunları eşleştirin <small class="muted">${esc(fname)} · ${grid.length - hdr - 1} satır</small></h2>
          <div class="row" style="margin-bottom:10px">${wb && wb.SheetNames.length > 1 ? `<label class="row">Sayfa <select id="sh">${wb.SheetNames.map((n) => `<option ${n === sheet ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}<label class="row">Başlık satırı <input id="hr" value="${hdr + 1}" style="width:60px" inputmode="numeric"></label></div>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>CepStok alanı</th><th>Excel sütunu</th><th>Örnek değer</th></tr></thead><tbody>${T.fields.map((f) => `<tr><td><b>${esc(f.l)}</b>${f.req ? ' <span class="neg">*</span>' : ''}</td><td><select data-f="${f.k}" aria-label="${esc(f.l)} sütunu"><option value="">— Alma —</option>${C.map((c) => `<option value="${c.i}" ${map[f.k] === c.i ? 'selected' : ''}>${esc(c.h)}</option>`).join('')}</select></td><td class="muted" data-ex="${f.k}"></td></tr>`).join('')}</tbody></table></div>
          ${T.opts ? `<h2 style="font-size:17px;margin-top:22px">4. Seçenekler</h2><div id="op"></div>` : ''}
          <h2 style="font-size:17px;margin-top:22px">Önizleme</h2><div id="pv"></div><p><button class="btn primary" id="go">${icon('upload', 16)} İçe aktar</button></p><div id="res"></div>`;
        let opF = null; if (T.opts) { opF = CS.form(T.opts.map((o) => ({ ...o, w: 'third', opts: typeof o.opts === 'function' ? o.opts() : o.opts }))); $('#op', s3).appendChild(opF); }
        const preview = () => {
          $$('[data-ex]', s3).forEach((td) => { const i = map[td.dataset.ex]; const v = i == null ? '' : grid.slice(hdr + 1).map((r) => r[i]).find((x) => String(x ?? '').trim() !== ''); td.textContent = v instanceof Date ? CS.date(CS.parseDate(v)) : String(v ?? '').slice(0, 40); });
          const R = rowsMapped(); const used = T.fields.filter((f) => map[f.k] != null); const bad = R.map((o, i) => [i, T.validate ? T.validate(o) : '']).filter((x) => x[1]);
          $('#pv', s3).innerHTML = `<p class="${bad.length ? 'alert' : 'alert info'}">${R.length} satır aktarılacak${bad.length ? `, ${bad.length} satır eksik bilgi nedeniyle atlanacak` : ''}.</p><div class="tbl-wrap" style="max-height:300px"><table class="tbl"><thead><tr>${used.map((f) => `<th>${esc(f.l)}</th>`).join('')}</tr></thead><tbody>${R.slice(0, 15).map((o, i) => `<tr class="${bad.find((b) => b[0] === i) ? 'warn' : ''}">${used.map((f) => `<td>${esc(String(o[f.k]).slice(0, 40))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
          const miss = T.fields.filter((f) => f.req && map[f.k] == null); $('#go', s3).disabled = !!miss.length; if (miss.length) $('#pv', s3).insertAdjacentHTML('afterbegin', `<p class="alert">Zorunlu alan eşleşmedi: ${miss.map((f) => esc(f.l)).join(', ')}</p>`);
        };
        s3.addEventListener('change', (e) => { const f = e.target.dataset.f; if (f) { map[f] = e.target.value === '' ? null : +e.target.value; preview(); } if (e.target.id === 'hr') { hdr = Math.max(0, CS.num(e.target.value) - 1); guess(); step3(fname); } if (e.target.id === 'sh') { sheet = e.target.value; loadSheet(); afterRead(fname); } });
        $('#go', s3).onclick = () => {
          const R = rowsMapped(); const valid = []; const errors = []; R.forEach((o, i) => { const v = T.validate ? T.validate(o) : ''; if (v) errors.push([i + hdr + 2, v]); else valid.push(o); });
          const op = opF ? opF.read() : {}; CS.confirm(`${valid.length} satır “${T.label}” olarak içe aktarılacak. Devam edilsin mi?`, () => {
            let r; try { r = T.run(valid, op || {}); } catch (e) { CS.toast('Aktarım hatası: ' + e.message, 'bad', 6000); console.error(e); return; }
            const allErr = errors.concat((r.errors || []).map((x) => [typeof x[0] === 'number' ? x[0] + hdr + 1 : x[0], x[1]]));
            $('#res', s3).innerHTML = `<p class="alert info"><b>${esc(r.msg)}.</b>${allErr.length ? ` ${allErr.length} satır atlandı.` : ''}</p>${allErr.length ? `<div class="tbl-wrap" style="max-height:220px"><table class="tbl"><tr><th>Excel satırı</th><th>Neden</th></tr>${allErr.slice(0, 200).map((x) => `<tr><td>${esc(x[0])}</td><td>${esc(x[1])}</td></tr>`).join('')}</table></div><p><button class="btn sm" id="errx">${icon('down', 15)} Atlanan satırları indir</button></p>` : ''}`;
            const ex = $('#errx', s3); if (ex) ex.onclick = () => CS.exportXLS('aktarim-hatalari', ['Excel satırı', 'Neden'], allErr);
            CS.toast(r.msg); CS.refreshBadges && CS.refreshBadges();
          }, 'İçe aktar', 'primary');
        };
        preview();
      };
      step1();
    }
  });
})();
