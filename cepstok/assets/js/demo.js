/* CepStok — örnek veri (ilk açılışta ya da yeni firmada "örnek verilerle başlat" seçilirse) */
(function () {
  // Barkoddan ürün bulma için küçük hazır ürün kütüphanesi (örnek)
  CS.LIBRARY = [
    ['8690504000014', 'Su 0,5 L', 'İçecek', 'Adet', 6, 10], ['8690526010015', 'Maden suyu 200 ml', 'İçecek', 'Adet', 7, 12], ['8690637000011', 'Kola 330 ml kutu', 'İçecek', 'Adet', 18, 30],
    ['8690504020012', 'Ayran 300 ml', 'Süt ürünleri', 'Adet', 11, 18], ['8690526080018', 'Süt 1 L', 'Süt ürünleri', 'Adet', 26, 38], ['8690504060018', 'Beyaz peynir 500 g', 'Süt ürünleri', 'Paket', 120, 175],
    ['8690632000016', 'Ekmek 250 g', 'Fırın', 'Adet', 8, 12.5], ['8690504090015', 'Simit', 'Fırın', 'Adet', 7, 15], ['8690777000019', 'Pirinç baldo 1 kg', 'Bakliyat', 'Paket', 55, 82],
    ['8690777010018', 'Kırmızı mercimek 1 kg', 'Bakliyat', 'Paket', 42, 64], ['8690777020017', 'Makarna 500 g', 'Bakliyat', 'Paket', 14, 24], ['8690777030016', 'Ayçiçek yağı 1 L', 'Temel gıda', 'Adet', 58, 85],
    ['8690777040015', 'Toz şeker 1 kg', 'Temel gıda', 'Paket', 32, 46], ['8690777050014', 'Çay 1 kg', 'Temel gıda', 'Paket', 210, 289], ['8690777060013', 'Bulaşık deterjanı 750 ml', 'Temizlik', 'Adet', 38, 59],
    ['8690777070012', 'Çamaşır suyu 1 L', 'Temizlik', 'Adet', 22, 35], ['8690777080011', 'Tuvalet kağıdı 16\'lı', 'Temizlik', 'Paket', 145, 199], ['8690777090010', 'Islak mendil', 'Kişisel bakım', 'Paket', 18, 29.9],
    ['8690777100016', 'Diş macunu 75 ml', 'Kişisel bakım', 'Adet', 44, 69], ['8690777110015', 'Şampuan 400 ml', 'Kişisel bakım', 'Adet', 72, 109], ['8690777120014', 'Çikolata 80 g', 'Atıştırmalık', 'Adet', 21, 35],
    ['8690777130013', 'Bisküvi', 'Atıştırmalık', 'Adet', 9, 15], ['8690777140012', 'Cips büyük boy', 'Atıştırmalık', 'Adet', 27, 45], ['8690777150011', 'Yumurta 10\'lu', 'Temel gıda', 'Paket', 48, 72]
  ];

  CS.demoDB = function (name) {
    const prevDb = CS.db, prevUser = CS.user, prevBranch = CS.branchId;
    const db = CS.defaultDB(name); CS.db = db; CS.user = db.users[0]; CS.branchId = 'br1';
    const id = () => CS.uid(); const t = CS.today();
    db.company = Object.assign(db.company, { name, title: name + ' Ticaret Ltd. Şti.', taxOffice: 'Kadıköy', taxNo: '1234567890', phone: '0216 000 00 00', email: 'info@ornek.com', address: 'Örnek Mah. Çarşı Cad. No:1', city: 'İstanbul', iban: 'TR00 0000 0000 0000 0000 0000 00' });
    db.branches.push({ id: 'br2', name: 'Kadıköy şube', address: '', phone: '' });
    db.warehouses.push({ id: 'wh2', name: 'Kadıköy depo', type: 'sube', branchId: 'br2' }, { id: 'wh3', name: 'Saha aracı 34 ABC 12', type: 'arac', branchId: 'br1', ref: '34 ABC 12' });
    db.accounts.push({ id: 'acc_banka', type: 'banka', name: 'Ziraat Bankası TL', bank: 'Ziraat Bankası', iban: 'TR00 0001 0000 0000 0000 0000 01', currency: '₺', opening: 650000 },
      { id: 'acc_pos', type: 'pos', name: 'Mağaza POS cihazı', bank: 'Ziraat Bankası', currency: '₺', opening: 0, commission: 1.8, settleDays: 1, settleAcc: 'acc_banka' },
      { id: 'acc_kk', type: 'kart', name: 'Şirket kredi kartı', bank: 'Garanti BBVA', currency: '₺', opening: 0, limit: 100000 },
      { id: 'acc_kasa2', type: 'kasa', name: 'Kadıköy kasa', currency: '₺', opening: 2000, branchId: 'br2' });
    db.accounts[0].opening = 5000;
    db.settings.rateManual = { USD: 41.5, EUR: 48.4, GBP: 55.6 }; // canlı kur gelene kadar kullanılan yedek değerler
    // kategoriler + ürünler
    const cats = {}; CS.LIBRARY.forEach((r) => { if (!cats[r[2]]) { cats[r[2]] = 'cat_' + id(); db.categories.push({ id: cats[r[2]], name: r[2], color: '' }); } });
    db.brands.push({ id: 'b1', name: 'Yerel üretici' }, { id: 'b2', name: 'Anadolu' });
    CS.LIBRARY.forEach((r, i) => db.products.push({ id: 'p' + i, name: r[1], barcode: r[0], code: 'STK' + String(i + 1).padStart(4, '0'), cat: cats[r[2]], brand: i % 3 ? 'b2' : 'b1', unit: r[3], buy: r[4], sell: r[5], prices: [r[5], CS.round(r[5] * 0.9, 2), CS.round(r[5] * 0.85, 2), CS.round(r[5] * 0.8, 2)], dealers: [{ m: '', p: CS.round(r[5] * 0.9, 2) }, { m: '', p: CS.round(r[5] * 0.85, 2) }, { m: '', p: CS.round(r[5] * 0.8, 2) }], cur: '₺', sourceId: i % 2 ? 'src1' : 'src2', kdv: r[2] === 'Temizlik' || r[2] === 'Kişisel bakım' ? 20 : 1, critical: 10, active: true, quick: i < 12, stock: {} }));
    // varyantlı ürün
    const tid = 'pv'; const tcat = 'cat_' + id(); db.categories.push({ id: tcat, name: 'Giyim' });
    db.products.push({ id: tid, name: 'Basic tişört', code: 'TSH', cat: tcat, unit: 'Adet', buy: 120, sell: 249.9, kdv: 10, critical: 3, active: true, variantAttrs: { Beden: ['S', 'M', 'L'], Renk: ['Beyaz', 'Siyah'] }, variants: [], stock: {} });
    ['S', 'M', 'L'].forEach((b) => ['Beyaz', 'Siyah'].forEach((r) => { const vid = 'pv_' + b + r; db.products.find((p) => p.id === tid).variants.push(vid); db.products.push({ id: vid, parentId: tid, name: 'Basic tişört', attrs: { Beden: b, Renk: r }, barcode: '86999000' + String(['S', 'M', 'L'].indexOf(b)) + String(['Beyaz', 'Siyah'].indexOf(r)) + '00', code: 'TSH-' + b + '-' + r[0], cat: tcat, unit: 'Adet', buy: 120, sell: 249.9, kdv: 10, critical: 3, active: true, stock: {} }); }));
    db.products.forEach((p) => { if (p.barcode && p.barcode.length >= 12) p.barcode = p.barcode.slice(0, 12) + CS.ean13Check(p.barcode.slice(0, 12)); });
    // reçeteli ürün (üretim)
    db.categories.push({ id: 'cat_ur', name: 'Üretim' });
    db.products.push({ id: 'p_tost', name: 'Kaşarlı tost', code: 'URT001', cat: 'cat_ur', unit: 'Adet', buy: 0, sell: 85, kdv: 10, critical: 0, active: true, recipe: [{ pid: 'p6', qty: 0.5 }, { pid: 'p5', qty: 0.1 }], labor: 8, stock: {} });
    db.products.push({ id: 'p_srv', name: 'Kargo hizmeti', code: 'HZM001', unit: 'Adet', buy: 0, sell: 75, kdv: 20, service: true, active: true, stock: {} });
    // cariler
    const C = (o) => { const c = Object.assign({ id: 'c_' + id(), kind: 'musteri', category: 'Perakende', city: 'İstanbul', createdAt: t, priceList: 0, limit: 0 }, o); db.contacts.push(c); return c; };
    const sup1 = C({ name: 'Anadolu Gıda Toptan', kind: 'tedarikci', category: 'Tedarikçi', taxNo: '9876543210', taxOffice: 'Ümraniye', phone: '05320000001', email: 'siparis@anadolugida.com', due: 30 });
    const sup2 = C({ name: 'Temiz Kimya San.', kind: 'tedarikci', category: 'Tedarikçi', taxNo: '1112223334', taxOffice: 'Tuzla', phone: '05320000002', due: 45 });
    const cu = [C({ name: 'Ayşe Yılmaz', phone: '05551112233', tc: '11111111110' }), C({ name: 'Mehmet Kaya', phone: '05552223344' }), C({ name: 'Kardeşler Market', category: 'Bayi', dealer: true, region: 'Kadıköy', lat: 40.9903, lng: 29.0290, taxNo: '4445556667', taxOffice: 'Kadıköy', phone: '05553334455', priceList: 1, limit: 50000, due: 30, efatura: true }), C({ name: 'Yıldız Kafe', category: 'Bayi', dealer: true, region: 'Beşiktaş', lat: 41.0430, lng: 29.0070, taxNo: '7778889990', taxOffice: 'Beşiktaş', phone: '05554445566', priceList: 2, due: 15 }), C({ name: 'Fatma Demir', phone: '05555556677' })];
    // personel
    db.staff.push({ id: 's1', name: 'Ali Çelik', title: 'Kasiyer', phone: '05551230000', salary: 28000, start: '2024-02-01', branchId: 'br1', active: true }, { id: 's2', name: 'Zeynep Ak', title: 'Saha satış', phone: '05551230001', salary: 32000, start: '2023-09-15', branchId: 'br1', active: true, warehouseId: 'wh3' });
    db.users.push({ id: 'u_kasa', name: 'Ali Çelik', username: 'ali', pin: '1111', roleId: 'r_cashier', branchId: 'br1', warehouseId: 'wh1', staffId: 's1', active: true }, { id: 'u_saha', name: 'Zeynep Ak', username: 'zeynep', pin: '2222', roleId: 'r_field', branchId: 'br1', warehouseId: 'wh3', staffId: 's2', active: true });
    db.projects.push({ id: 'pr1', name: 'Yıldız Kafe açılış tedariki', status: 'aktif', budget: 60000, cid: cu[3].id, start: CS.addDays(t, -40) });
    // açılış alımları
    const start = CS.addDays(t, -175);
    const buyLines = db.products.filter((p) => !p.variants && !p.service && !p.recipe).map((p) => ({ pid: p.id, name: CS.productName(p), qty: p.parentId ? 25 : 140 + (p.id.length * 7) % 60, unit: p.unit, price: p.buy, kdv: p.kdv, disc: 0 }));
    const half = Math.ceil(buyLines.length / 2);
    const a1 = CS.postDoc({ type: 'alis', date: start, due: CS.addDays(start, 30), cid: sup1.id, wh: 'wh1', lines: buyLines.slice(0, half), currency: '₺', rate: 1, edoc: 'efatura', status: 'onay', eno: 'ANG2025000000' + 101 });
    const a2 = CS.postDoc({ type: 'alis', date: CS.addDays(start, 2), due: CS.addDays(start, 47), cid: sup2.id, wh: 'wh1', lines: buyLines.slice(half), currency: '₺', rate: 1, edoc: 'efatura', status: 'onay' });
    CS.payment({ dir: 'out', cid: sup1.id, accId: 'acc_banka', amount: a1.total, date: CS.addDays(start, 25), desc: 'Havale — ' + a1.no, docId: a1.id });
    CS.payment({ dir: 'out', cid: sup2.id, accId: 'acc_banka', amount: Math.round(a2.total * 0.6), date: CS.addDays(start, 40), desc: 'Kısmi ödeme — ' + a2.no, docId: a2.id }); CS.payment({ dir: 'out', cid: sup2.id, accId: 'acc_banka', amount: a2.total - Math.round(a2.total * 0.6), date: CS.addDays(start, 75), desc: 'Kalan ödeme — ' + a2.no, docId: a2.id });
    // depo transferi
    const trIds = db.products.filter((p) => !p.variants && !p.service && !p.recipe && !p.parentId).map((p) => p.id); trIds.forEach((pid) => { CS.addMove({ pid, wh: 'wh1', qty: -30, type: 'transfer', ref: 'tr_demo', date: CS.addDays(start, 3) }); CS.addMove({ pid, wh: 'wh2', qty: 30, type: 'transfer', ref: 'tr_demo', date: CS.addDays(start, 3) }); });
    db.transfers.push({ id: 'tr_demo', date: CS.addDays(start, 3), from: 'wh1', to: 'wh2', lines: trIds.map((pid) => ({ pid, qty: 30 })), note: 'Şube açılış stoku', userId: 'u_admin' });
    // 6 ay satış
    let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const sellable = db.products.filter((p) => !p.variants && !p.service && !p.recipe && !p.parentId);
    for (let d = 170; d >= 0; d -= 1) {
      const date = CS.addDays(t, -d); const n = 1 + Math.floor(rnd() * (d < 30 ? 4 : 3));
      for (let k = 0; k < n; k++) {
        const lines = []; const cnt = 1 + Math.floor(rnd() * 4);
        for (let j = 0; j < cnt; j++) { const p = sellable[Math.floor(rnd() * sellable.length)]; if (lines.find((l) => l.pid === p.id)) continue; lines.push({ pid: p.id, name: CS.productName(p), qty: 1 + Math.floor(rnd() * 3), unit: p.unit, price: CS.round(p.sell / (1 + p.kdv / 100), 4), kdv: p.kdv, disc: 0, cost: p.buy }); }
        const r = rnd(); const cust = r < 0.25 ? cu[Math.floor(rnd() * cu.length)] : null;
        const doc = CS.postDoc({ type: 'pos', date, cid: cust?.id || '', wh: rnd() < 0.8 ? 'wh1' : 'wh2', branchId: rnd() < 0.8 ? 'br1' : 'br2', lines, currency: '₺', rate: 1, status: 'tamam', sellerId: rnd() < 0.6 ? 'u_kasa' : 'u_admin', edoc: cust?.efatura ? 'efatura' : 'earsiv' });
        const method = rnd() < 0.55 ? 'nakit' : 'kart';
        if (!(cust && rnd() < 0.4)) CS.payment({ dir: 'in', cid: doc.cid, accId: method === 'nakit' ? (doc.branchId === 'br2' ? 'acc_kasa2' : 'acc_kasa') : 'acc_pos', amount: doc.total, date, desc: 'POS ' + (method === 'nakit' ? 'nakit' : 'kart') + ' — ' + doc.no, method, docId: doc.id });
      }
      if (d % 30 === 12) { const ps = sellable.slice(0, 10).map((p) => ({ pid: p.id, name: p.name, qty: 40, unit: p.unit, price: p.buy, kdv: p.kdv, disc: 2 })); const ad = CS.postDoc({ type: 'alis', date, due: CS.addDays(date, 30), cid: sup1.id, wh: 'wh1', lines: ps, currency: '₺', rate: 1, edoc: 'efatura', status: 'onay' }); if (d > 35) CS.payment({ dir: 'out', cid: sup1.id, accId: 'acc_banka', amount: ad.total, date: CS.addDays(date, 28), desc: 'Havale — ' + ad.no, method: 'havale', docId: ad.id }); }
      if (d % 9 === 3) { const amt = 1500 + Math.round(rnd() * 3000); CS.addAccMove({ accId: 'acc_kasa', amt: -amt, date, desc: ['Elektrik faturası', 'Kırtasiye', 'Kargo', 'Yemek', 'Bakım onarım'][d % 5], kind: 'gider', category: ['Elektrik', 'Kırtasiye', 'Kargo', 'Yemek', 'Bakım onarım'][d % 5] }); }
      if (d % 30 === 1) { CS.addAccMove({ accId: 'acc_banka', amt: -25000, date, desc: 'Dükkan kirası', kind: 'gider', category: 'Kira' }); db.staff.forEach((s) => CS.addAccMove({ accId: 'acc_banka', amt: -s.salary, date, desc: 'Maaş — ' + s.name, kind: 'gider', category: 'Maaş', staffId: s.id })); }
      if (d % 3 === 0) { const amt = CS.round(CS.accBalance('acc_pos'), 2); if (amt > 0) { CS.addAccMove({ accId: 'acc_pos', amt: -amt, date, desc: 'POS günsonu aktarımı', kind: 'virman', ref: 'v' + d }); CS.addAccMove({ accId: 'acc_banka', amt, date, desc: 'POS tahsilatı ← Mağaza POS cihazı', kind: 'virman', ref: 'v' + d }); CS.addAccMove({ accId: 'acc_banka', amt: -CS.round(amt * 0.018, 2), date, desc: 'POS komisyonu', kind: 'gider', category: 'Komisyon', ref: 'v' + d }); } }
    }
    db.accMoves = db.accMoves.filter((m) => m.amt !== 0);
    // toptan faturalar (vadeli)
    const f1 = CS.postDoc({ type: 'satis', date: CS.addDays(t, -50), due: CS.addDays(t, -20), cid: cu[2].id, wh: 'wh1', lines: sellable.slice(0, 6).map((p) => ({ pid: p.id, name: p.name, qty: 20, unit: p.unit, price: p.prices[1] / (1 + p.kdv / 100), kdv: p.kdv, disc: 5 })), currency: '₺', rate: 1, edoc: 'efatura', status: 'onay' });
    CS.postDoc({ type: 'satis', date: CS.addDays(t, -10), due: CS.addDays(t, 5), cid: cu[3].id, wh: 'wh1', projectId: 'pr1', lines: sellable.slice(8, 14).map((p) => ({ pid: p.id, name: p.name, qty: 12, unit: p.unit, price: p.prices[2] / (1 + p.kdv / 100), kdv: p.kdv, disc: 0 })), currency: '₺', rate: 1, edoc: 'efatura', status: 'onay' });
    CS.payment({ dir: 'in', cid: cu[2].id, accId: 'acc_banka', amount: 5000, date: CS.addDays(t, -30), desc: 'Havale tahsilat', docId: f1.id });
    // çekler
    db.cheques.push({ id: 'ch1', kind: 'cek', dir: 'alinan', no: '0012345', bank: 'İş Bankası', branch: 'Kadıköy', drawer: 'Kardeşler Market', amount: 7500, date: CS.addDays(t, -20), due: CS.addDays(t, 4), cid: cu[2].id, status: 'portfoy', history: [{ date: CS.addDays(t, -20), status: 'portfoy', note: 'Müşteriden alındı' }] });
    CS.addLedger({ cid: cu[2].id, amt: -7500, date: CS.addDays(t, -20), desc: 'Çek alındı 0012345', ref: 'ch1', kind: 'cek' });
    db.cheques.push({ id: 'ch2', kind: 'senet', dir: 'verilen', no: 'S-2025-08', amount: 12000, date: CS.addDays(t, -60), due: CS.addDays(t, 25), cid: sup2.id, status: 'verildi', history: [{ date: CS.addDays(t, -60), status: 'verildi', note: 'Tedarikçiye verildi' }] });
    CS.addLedger({ cid: sup2.id, amt: 12000, date: CS.addDays(t, -60), desc: 'Senet verildi S-2025-08', ref: 'ch2', kind: 'cek' });
    // kredi
    const inst = []; for (let i = 1; i <= 12; i++) inst.push({ no: i, due: CS.addDays(CS.addDays(t, -120), i * 30), amount: 4600, paid: i <= 4, paidDate: i <= 4 ? CS.addDays(CS.addDays(t, -120), i * 30) : '' });
    db.loans.push({ id: 'l1', name: 'İşletme kredisi', bank: 'Halkbank', amount: 50000, rate: 3.2, start: CS.addDays(t, -120), accId: 'acc_banka', inst });
    // demirbaş
    db.assets.push({ id: 'as1', name: 'Barkodlu yazar kasa', code: 'DMB001', date: '2024-01-10', cost: 14500, life: 5, location: 'Merkez şube', staffId: 's1', serial: 'OKC-998877' }, { id: 'as2', name: 'Teşhir buzdolabı', code: 'DMB002', date: '2023-06-01', cost: 38000, life: 8, location: 'Merkez şube' }, { id: 'as3', name: 'Panelvan araç', code: 'DMB003', date: '2022-03-15', cost: 650000, life: 5, location: 'Saha', staffId: 's2', serial: '34 ABC 12' });
    // teklif ve sipariş
    CS.postDoc({ type: 'teklif', date: CS.addDays(t, -3), valid: CS.addDays(t, 12), cid: cu[3].id, lines: sellable.slice(2, 5).map((p) => ({ pid: p.id, name: p.name, qty: 30, unit: p.unit, price: p.prices[2] / (1 + p.kdv / 100), kdv: p.kdv, disc: 3 })), currency: '₺', rate: 1, status: 'bekliyor' });
    CS.postDoc({ type: 'siparis', date: t, cid: cu[2].id, channel: 'whatsapp', lines: sellable.slice(5, 8).map((p) => ({ pid: p.id, name: p.name, qty: 10, unit: p.unit, price: p.prices[1] / (1 + p.kdv / 100), kdv: p.kdv, disc: 0 })), currency: '₺', rate: 1, status: 'yeni', cargo: '' });
    CS.postDoc({ type: 'siparis', date: CS.addDays(t, -1), cid: '', channel: 'trendyol', mpNo: 'TY-55889911', buyer: 'Online müşteri', lines: [{ pid: 'pv_MBeyaz', name: 'Basic tişört — M / Beyaz', qty: 2, unit: 'Adet', price: 249.9 / 1.1, kdv: 10, disc: 0 }], currency: '₺', rate: 1, status: 'hazirlaniyor', cargo: 'Yurtiçi Kargo' });
    // alındığı yerler, dövizli ürünler, bayi ziyaretleri
    db.sources.push({ id: 'src1', name: 'Anadolu Gıda Toptan', code: '001', cid: sup1.id }, { id: 'src2', name: 'Bayrampaşa hal', code: '002' }, { id: 'src3', name: 'İthalatçı (dolar)', code: '003', cid: sup2.id });
    const ecat = 'cat_el'; db.categories.push({ id: ecat, name: 'Elektronik' });
    [['Bluetooth kulaklık', 12.5, 40], ['Powerbank 10000 mAh', 9.8, 35], ['Şarj kablosu USB-C', 1.6, 60]].forEach(([n, b, m], i) => { const pid = 'pfx' + i; const bc = '86990' + String(7000000 + i); db.products.push({ id: pid, name: n, barcode: bc.slice(0, 12) + CS.ean13Check(bc.slice(0, 12)), code: 'ELK' + (i + 1), cat: ecat, unit: 'Adet', kdv: 20, critical: 5, active: true, cur: 'USD', buyFx: b, autoPrice: true, margin: m, dealers: [{ m: Math.round(m * 0.6), p: '' }, { m: Math.round(m * 0.45), p: '' }, { m: Math.round(m * 0.3), p: '' }], sourceId: 'src3', quick: true, stock: {} }); CS.addMove({ pid, wh: 'wh1', qty: 30, type: 'acilis', ref: 'open_' + pid, date: start, cost: 0 }); });
    [[cu[2], 3, 'Sipariş alındı'], [cu[2], 12, 'Tahsilat yapıldı'], [cu[3], 5, 'Ziyaret edildi'], [cu[3], 1, 'Sipariş alındı']].forEach(([c, d, r]) => db.visits.push({ id: 'vs' + id(), cid: c.id, at: CS.addDays(t, -d) + 'T10:' + (10 + d) + ':00.000Z', date: CS.addDays(t, -d), userId: 'u_saha', result: r, note: '', lat: c.lat + 0.0004, lng: c.lng - 0.0003, acc: 12, dist: 52 }));
    db.notes.push({ id: 'n1', text: 'Kardeşler Market ile vade görüşmesi', date: t, done: false });
    db.lostSales.push({ id: 'ls1', date: CS.addDays(t, -2), pid: 'pv_LSiyah', qty: 2, reason: 'Stokta yok', note: 'Müşteri tekrar soracak' });
    db.log = [{ id: id(), at: CS.now(), user: 'Sistem', action: 'Örnek verilerle firma oluşturuldu', detail: name }];
    const out = CS.db; CS.db = prevDb; CS.user = prevUser; CS.branchId = prevBranch; return out;
  };
})();
