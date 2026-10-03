/* Cari hesaplar: müşteri/tedarikçi kartı, ekstre, tahsilat/ödeme, virman, hatırlatma, mutabakat */
(function () {
  const { $, $$, esc, money, icon } = CS;
  const KIND = { musteri: 'Müşteri', tedarikci: 'Tedarikçi', both: 'Müşteri ve tedarikçi', personel: 'Personel' };

  CS.validTC = (s) => { s = String(s || ''); if (!/^[1-9]\d{10}$/.test(s)) return false; const d = s.split('').map(Number); const t10 = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10; return t10 === d[9] && (d.slice(0, 10).reduce((a, b) => a + b, 0) % 10) === d[10]; };
  CS.validVKN = (s) => { s = String(s || ''); if (!/^\d{10}$/.test(s)) return false; const d = s.split('').map(Number); let sum = 0; for (let i = 0; i < 9; i++) { let t = (d[i] + 10 - (i + 1)) % 10; let r = (t * 2 ** (10 - (i + 1))) % 9; if (t !== 0 && r === 0) r = 9; sum += r; } return (10 - (sum % 10)) % 10 === d[9]; };

  CS.mod('contacts', {
    title: 'Cari hesaplar',
    render(page, prm) {
      const sub = prm._[0];
      if (sub && !['musteri', 'tedarikci', 'virman', 'cats', 'overdue', 'dealers', 'visits'].includes(sub)) return detail(page, sub, prm);
      const tab = sub || 'all';
      const body = CS.head(page, 'Cari hesaplar', (CS.can('contacts', 'e') ? CS.btn('Yeni cari', 'new', 'primary', 'plus') + CS.btn('Yeni bayi', 'newd', '', 'building') + CS.btn('Tahsilat', 'in', '', 'down') + CS.btn('Ödeme', 'out', '', 'up') : '') + CS.btn('İçe aktar', 'imp', '', 'upload'), [['all', 'Tüm cariler', 'contacts'], ['dealers', 'Bayiler', 'contacts/dealers'], ['visits', 'Bayi ziyaretleri', 'contacts/visits'], ['musteri', 'Müşteriler', 'contacts/musteri'], ['tedarikci', 'Tedarikçiler', 'contacts/tedarikci'], ['overdue', 'Vadesi geçenler', 'contacts/overdue'], ['virman', 'Virman', 'contacts/virman'], ['cats', 'Cari kategorileri', 'contacts/cats']], tab);
      CS.bind(page, { newd: () => contactForm({ kind: 'musteri', dealer: true, priceList: 1, category: 'Bayi' }), new: () => contactForm({ kind: tab === 'tedarikci' ? 'tedarikci' : 'musteri', ...(tab === 'dealers' ? { dealer: true, priceList: 1, category: 'Bayi' } : {}) }), in: () => quickPayment('in'), out: () => quickPayment('out'), imp: () => CS.go('import?t=contacts') });
      if (tab === 'virman') return virman(body);
      if (tab === 'dealers') return dealers(body);
      if (tab === 'visits') return visitsList(body);
      if (tab === 'cats') return cats(body);
      if (tab === 'overdue') return overdue(body);
      list(body, tab);
    }
  });

  function lastMove(cid) { const l = CS.db.ledger.filter((x) => x.cid === cid); return l.length ? l.reduce((a, b) => (a.date > b.date ? a : b)).date : ''; }
  function list(body, tab) {
    const st = { cat: '', bal: '' };
    const rows = () => CS.db.contacts.filter((c) => !c.archived && (tab === 'all' || c.kind === tab || c.kind === 'both') && (!st.cat || c.category === st.cat) && (!st.bal || (st.bal === 'pos' ? CS.balance(c.id) > 0.005 : st.bal === 'neg' ? CS.balance(c.id) < -0.005 : Math.abs(CS.balance(c.id)) < 0.005)));
    body.innerHTML = '<div id="ct"></div>';
    const t = CS.table($('#ct', body), {
      rows: rows(), ph: 'Ad, telefon, vergi no…', searchText: (c) => [c.name, c.title, c.phone, c.email, c.taxNo, c.tc, c.code, c.city].join(' '),
      tools: `<select id="cc" aria-label="Kategori"><option value="">Tüm kategoriler</option>${CS.db.contactCats.map((c) => `<option>${esc(c)}</option>`).join('')}</select><select id="cb" aria-label="Bakiye"><option value="">Tüm bakiyeler</option><option value="pos">Alacaklı olduklarımız</option><option value="neg">Borçlu olduklarımız</option><option value="zero">Bakiyesi sıfır</option></select><button class="btn" id="cx">${icon('down', 15)} Excel</button><button class="btn" id="csms">${icon('msg', 15)} Toplu hatırlatma</button>`,
      cols: [{ l: 'Cari', v: (c) => c.name, f: (c) => `<b>${esc(c.name)}</b><small>${esc(KIND[c.kind] || '')}${c.category ? ' · ' + esc(c.category) : ''}${c.efatura ? ' · e-Fatura' : ''}</small>` }, { l: 'Telefon', k: 'phone' }, { l: 'Şehir', k: 'city' }, { l: 'Son hareket', v: (c) => lastMove(c.id), f: (c) => CS.date(lastMove(c.id)) }, { l: 'Bakiye', a: 'r', v: (c) => CS.balance(c.id), f: (c) => CS.balanceLabel(CS.balance(c.id)) }],
      onRow: (c) => CS.go('contacts/' + c.id),
      actions: (c) => CS.actBtn('in', 'Tahsilat', 'down') + CS.actBtn('out', 'Ödeme', 'up') + CS.actBtn('st', 'Ekstre', 'print'),
      onAct: (a, c) => { if (a === 'in') quickPayment('in', c.id); if (a === 'out') quickPayment('out', c.id); if (a === 'st') statement(c, '2000-01-01', CS.today()); },
      foot: (rs) => { const b = rs.map((c) => CS.balance(c.id)); return `<tr><td colspan="4">${rs.length} cari · Alacak ${money(CS.sum(b.filter((x) => x > 0), (x) => x))} · Borç ${money(-CS.sum(b.filter((x) => x < 0), (x) => x))}</td><td class="r">${CS.balanceLabel(CS.sum(b, (x) => x))}</td><td></td></tr>`; }
    });
    $('#cc', body).onchange = (e) => { st.cat = e.target.value; t.redraw(rows()); };
    $('#cb', body).onchange = (e) => { st.bal = e.target.value; t.redraw(rows()); };
    $('#cx', body).onclick = () => CS.exportXLS('cariler', ['Cari', 'Tür', 'Kategori', 'Vergi dairesi', 'VKN/TCKN', 'Telefon', 'E-posta', 'Şehir', 'Adres', 'Bakiye'], t.rows().map((c) => [c.name, KIND[c.kind], c.category || '', c.taxOffice || '', c.taxNo || c.tc || '', c.phone || '', c.email || '', c.city || '', c.address || '', CS.balance(c.id)]));
    $('#csms', body).onclick = () => bulkRemind(t.rows().filter((c) => CS.balance(c.id) > 0.005));
  }

  function overdue(body) {
    const t = CS.today();
    const rows = CS.db.docs.filter((d) => ['satis', 'alis'].includes(d.type) && d.status !== 'iptal' && d.cid && d.due && d.due < t).map((d) => ({ d, rest: CS.round(d.totalTry - CS.docPaid(d)) })).filter((x) => x.rest > 0.009);
    body.innerHTML = '<p class="muted">Vadesi geçmiş ve tam ödenmemiş faturalar (fatura bazlı ödeme eşleştirmesi).</p><div id="ot"></div>';
    CS.table($('#ot', body), { rows, empty: 'Vadesi geçmiş fatura yok.', cols: [{ l: 'Vade', v: (x) => x.d.due, f: (x) => `<span class="neg">${CS.date(x.d.due)}</span>` }, { l: 'Gecikme', a: 'r', v: (x) => CS.daysBetween(x.d.due, t), f: (x) => CS.daysBetween(x.d.due, t) + ' gün' }, { l: 'Tür', v: (x) => (x.d.type === 'satis' ? 'Alacak' : 'Borç') }, { l: 'Belge', v: (x) => x.d.no }, { l: 'Cari', v: (x) => CS.contactName(x.d.cid) }, { l: 'Fatura', a: 'r', v: (x) => x.d.totalTry, f: (x) => CS.fmt2(x.d.totalTry) }, { l: 'Kalan', a: 'r', v: (x) => x.rest, f: (x) => `<b>${CS.fmt2(x.rest)}</b>` }], onRow: (x) => CS.go('contacts/' + x.d.cid), actions: (x) => (x.d.type === 'satis' ? CS.actBtn('rem', 'Hatırlat', 'msg') + CS.actBtn('in', 'Tahsilat', 'down') : CS.actBtn('out', 'Ödeme', 'up')), onAct: (a, x) => { if (a === 'rem') remind(CS.contact(x.d.cid)); if (a === 'in') quickPayment('in', x.d.cid, x.rest, x.d.id); if (a === 'out') quickPayment('out', x.d.cid, x.rest, x.d.id); } });
  }

  /* ---------- Cari formu ---------- */
  function contactForm(c0, cb) {
    const isNew = !c0?.id; const c = Object.assign({ kind: 'musteri', priceList: 0 }, c0);
    const f = CS.form([
      { k: 'kind', l: 'Cari türü', t: 'select', opts: Object.entries(KIND).slice(0, 3), w: 'third' }, { k: 'type', l: 'Kişi / firma', t: 'select', opts: [['firma', 'Tüzel kişi (firma)'], ['sahis', 'Gerçek kişi / şahıs']], w: 'third' }, { k: 'code', l: 'Cari kodu', w: 'third' },
      { k: 'name', l: 'Kısa ad (listelerde görünür)', req: true }, { k: 'title', l: 'Ticari ünvan / ad soyad' },
      { k: 'taxNo', l: 'Vergi no (VKN)', w: 'third' }, { k: 'tc', l: 'TC kimlik no', w: 'third' }, { k: 'taxOffice', l: 'Vergi dairesi', w: 'third' },
      { k: 'phone', l: 'Cep telefonu', w: 'third' }, { k: 'phone2', l: 'Sabit telefon', w: 'third' }, { k: 'email', l: 'E-posta', w: 'third' },
      { k: 'address', l: 'Adres', w: 'full' }, { k: 'district', l: 'İlçe', w: 'third' }, { k: 'city', l: 'İl', w: 'third' }, { k: 'country', l: 'Ülke', w: 'third', def: 'Türkiye' },
      { t: 'sep', l: 'Ticari koşullar' },
      { k: 'category', l: 'Kategori', t: 'select', opts: [''].concat(CS.db.contactCats), w: 'third' }, { k: 'priceList', l: 'Fiyat listesi', t: 'select', opts: CS.db.settings.priceLists.map((n, i) => [String(i), n]), w: 'third' }, { k: 'discount', l: 'Sabit iskonto %', t: 'number', w: 'third' },
      { k: 'due', l: 'Vade (gün)', t: 'number', w: 'third' }, { k: 'limit', l: 'Risk / kredi limiti (₺)', t: 'money', w: 'third' }, { k: 'currency', l: 'Çalışma dövizi', t: 'select', opts: CS.CURRENCIES, w: 'third' },
      { k: 'iban', l: 'IBAN', w: 'full' }, { k: 'contactPerson', l: 'Yetkili kişi' }, { k: 'web', l: 'Web sitesi' },
      { k: 'efatura', l: 'e-Fatura mükellefi', t: 'check', w: 'third' }, { k: 'smsOk', l: 'SMS / ileti izni var', t: 'check', w: 'third' }, { k: 'archived', l: 'Arşivlendi (listede gizle)', t: 'check', w: 'third' },
      ...(isNew ? [{ t: 'sep', l: 'Açılış bakiyesi (devir)' }, { k: 'openAmt', l: 'Tutar', t: 'money', w: 'third' }, { k: 'openDir', l: 'Yön', t: 'select', opts: [['borc', 'Cari bize borçlu'], ['alacak', 'Biz cariye borçluyuz']], w: 'third' }, { k: 'openDate', l: 'Tarih', t: 'date', def: CS.today(), w: 'third' }] : []),
      { t: 'sep', l: 'Bayi ve konum' },
      { k: 'dealer', l: 'Bu cari bir bayidir (bayi raporu ve ziyaret takibi)', t: 'check', w: 'full' },
      { k: 'region', l: 'Bölge / güzergâh', w: 'third' }, { k: 'visitDays', l: 'Ziyaret günleri', w: 'third', ph: 'ör. Pazartesi, Perşembe' }, { k: 'repId', l: 'Sorumlu satış temsilcisi', t: 'select', opts: [['', '—']].concat(CS.db.users.map((u) => [u.id, u.name])), w: 'third' },
      { k: 'lat', l: 'Enlem', t: 'number', w: 'third' }, { k: 'lng', l: 'Boylam', t: 'number', w: 'third' },
      { k: 'note', l: 'Notlar', t: 'textarea', w: 'full' }
    ], { ...c, priceList: String(c.priceList || 0) });
    const lbox = document.createElement('div'); lbox.className = 'row'; lbox.style.marginTop = '10px';
    lbox.innerHTML = `<button class="btn sm" type="button" id="geo">${CS.icon('home', 15)} Şu anki konumumu kaydet</button><a class="btn sm" id="gmap" target="_blank" rel="noopener">Haritada göster</a><span class="muted" id="geoi">Bayinin yanındayken basın; konum telefonun GPS’inden alınır.</span>`;
    const wrapF = document.createElement('div'); wrapF.append(f, lbox);
    const updMap = () => { const la = $('#f_lat', f).value, ln = $('#f_lng', f).value; const a = $('#gmap', lbox); if (la && ln) { a.href = CS.mapUrl(CS.num(la), CS.num(ln)); a.hidden = false; } else a.hidden = true; };
    f.addEventListener('change', updMap); setTimeout(updMap, 0);
    $('#geo', lbox).onclick = async () => { $('#geoi', lbox).textContent = 'Konum alınıyor…'; try { const g = await CS.getLocation(); $('#f_lat', f).value = String(CS.round(g.lat, 6)).replace('.', ','); $('#f_lng', f).value = String(CS.round(g.lng, 6)).replace('.', ','); $('#geoi', lbox).textContent = `Konum alındı (±${Math.round(g.acc)} m).`; updMap(); } catch (e) { $('#geoi', lbox).textContent = e.message; } };
    CS.modal({
      title: isNew ? (c.dealer ? 'Yeni bayi' : 'Yeni cari') : 'Cari kartı: ' + c.name, size: 'lg', body: wrapF, buttons: [{ label: 'Vazgeç' }, {
        label: 'Kaydet', kind: 'primary', onClick: () => {
          const v = f.read(); if (!v) return false;
          if (v.tc && !CS.validTC(v.tc)) { CS.toast('TC kimlik numarası geçersiz.', 'bad'); return false; }
          if (v.taxNo && !CS.validVKN(v.taxNo) && !/^\d{11}$/.test(v.taxNo)) { if (!confirm('Vergi numarası doğrulama algoritmasına uymuyor. Yine de kaydedilsin mi?')) return false; }
          const dup = CS.db.contacts.find((x) => x.id !== c.id && ((v.taxNo && x.taxNo === v.taxNo) || (v.tc && x.tc === v.tc))); if (dup && !confirm(`Bu vergi/TC numarası “${dup.name}” carisinde kayıtlı. Yine de kaydedilsin mi?`)) return false;
          const { openAmt, openDir, openDate, ...rest } = v; Object.assign(c, rest); c.priceList = +v.priceList;
          if (isNew) { c.id = 'c_' + CS.uid(); c.createdAt = CS.today(); CS.db.contacts.push(c); if (openAmt) CS.addLedger({ cid: c.id, amt: openDir === 'borc' ? openAmt : -openAmt, date: openDate, desc: 'Açılış bakiyesi (devir)', ref: 'open_' + c.id, kind: 'devir' }); }
          CS.log(isNew ? 'Cari eklendi' : 'Cari güncellendi', c.name); CS.save(); cb ? cb(c) : CS.route();
        }
      }]
    });
  }
  CS.contactForm = contactForm;

  /* ---------- Tahsilat / ödeme ---------- */
  function quickPayment(dir, cid, amount, docId) {
    const methods = dir === 'in' ? [['nakit', 'Nakit'], ['havale', 'Havale / EFT'], ['kart', 'Kredi kartı / POS'], ['cek', 'Çek'], ['senet', 'Senet']] : [['nakit', 'Nakit'], ['havale', 'Havale / EFT'], ['kart', 'Şirket kredi kartı'], ['cek', 'Kendi çekimiz'], ['senet', 'Senet'], ['ciro', 'Portföydeki çeki ciro et']];
    const f = CS.form([{ k: 'cid', l: 'Cari', t: 'select', opts: CS.contactOptions(null), req: true, w: 'full' }, { k: 'method', l: 'Ödeme şekli', t: 'select', opts: methods, w: 'third' }, { k: 'amount', l: 'Tutar', t: 'money', req: true, w: 'third' }, { k: 'date', l: 'Tarih', t: 'date', def: CS.today(), w: 'third' }, { k: 'accId', l: 'Kasa / banka hesabı', t: 'select', opts: CS.accOptions(null), w: 'full' }, { k: 'docId', l: 'İlgili fatura (isteğe bağlı)', t: 'select', opts: [['', '— Fatura seçmeden —']], w: 'full' }, { k: 'chNo', l: 'Çek/senet no', w: 'third' }, { k: 'chBank', l: 'Banka', w: 'third' }, { k: 'chDue', l: 'Vade', t: 'date', w: 'third' }, { k: 'chCiro', l: 'Ciro edilecek çek', t: 'select', opts: [['', '—']].concat(CS.db.cheques.filter((x) => x.dir === 'alinan' && x.status === 'portfoy').map((x) => [x.id, `${x.no} · ${CS.money(x.amount)} · ${CS.date(x.due)}`])), w: 'full' }, { k: 'projectId', l: 'Proje', t: 'select', opts: CS.projOptions(), w: 'third' }, { k: 'desc', l: 'Açıklama', w: 'full' }], { cid, amount, docId });
    const sync = () => {
      const m = $('#f_method', f).value; const ch = m === 'cek' || m === 'senet';
      $$('#f_chNo,#f_chBank,#f_chDue', f).forEach((i) => (i.closest('.fld').style.display = ch ? '' : 'none')); $('#f_chCiro', f).closest('.fld').style.display = m === 'ciro' ? '' : 'none'; $('#f_accId', f).closest('.fld').style.display = ch || m === 'ciro' ? 'none' : '';
      const accT = m === 'nakit' ? ['kasa'] : m === 'kart' ? (dir === 'in' ? ['pos', 'banka'] : ['kart']) : ['banka', 'vadeli', 'doviz']; const sel = $('#f_accId', f); const cur = sel.value; sel.innerHTML = CS.accOptions(accT).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join(''); if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
      const c = $('#f_cid', f).value; const dsel = $('#f_docId', f); const keep = dsel.value || docId || '';
      const docs = CS.db.docs.filter((d) => d.cid === c && d.status !== 'iptal' && (dir === 'in' ? ['satis', 'pos', 'alis_iade'] : ['alis', 'satis_iade', 'pos_iade']).includes(d.type)).map((d) => ({ d, rest: CS.round(d.totalTry - CS.docPaid(d)) })).filter((x) => x.rest > 0.009);
      dsel.innerHTML = '<option value="">— Fatura seçmeden —</option>' + docs.map((x) => `<option value="${x.d.id}" ${x.d.id === keep ? 'selected' : ''}>${esc(x.d.no)} · kalan ${CS.money(x.rest)} · vade ${CS.date(x.d.due)}</option>`).join('');
      const bal = c ? CS.balance(c) : 0; $('#f_cid', f).closest('.fld').querySelector('small')?.remove(); if (c) $('#f_cid', f).insertAdjacentHTML('afterend', `<small>Güncel bakiye: ${CS.balanceText(bal)}</small>`);
    };
    f.addEventListener('change', (e) => { sync(); if (e.target.id === 'f_chCiro') { const ch = CS.byId('cheques', e.target.value); if (ch) $('#f_amount', f).value = CS.fmt2(ch.amount); } if (e.target.id === 'f_docId' && e.target.value && !CS.num($('#f_amount', f).value)) { const d = CS.byId('docs', e.target.value); $('#f_amount', f).value = CS.fmt2(d.totalTry - CS.docPaid(d)); } }); sync();
    CS.modal({
      title: dir === 'in' ? 'Tahsilat al' : 'Ödeme yap', body: f, buttons: [{ label: 'Vazgeç' }, {
        label: dir === 'in' ? 'Tahsilatı kaydet' : 'Ödemeyi kaydet', kind: 'primary', onClick: () => {
          const v = f.read(); if (!v) return false; const c = CS.contact(v.cid); const desc = v.desc || `${dir === 'in' ? 'Tahsilat' : 'Ödeme'} (${methods.find((m) => m[0] === v.method)[1]})`;
          if (v.method === 'cek' || v.method === 'senet') { CS.addCheque({ kind: v.method, dir: dir === 'in' ? 'alinan' : 'verilen', no: v.chNo, bank: v.chBank, due: v.chDue || v.date, amount: v.amount, cid: v.cid, date: v.date, docId: v.docId, drawer: dir === 'in' ? c.title || c.name : CS.db.company.name }); }
          else if (v.method === 'ciro') { const ch = CS.byId('cheques', v.chCiro); if (!ch) { CS.toast('Çek seçin.', 'bad'); return false; } ch.status = 'ciro'; ch.toCid = v.cid; ch.history.push({ date: v.date, status: 'ciro', note: 'Ciro edildi: ' + c.name }); CS.addLedger({ cid: v.cid, amt: ch.amount, date: v.date, desc: `Çek ciro ${ch.no}`, ref: ch.id + '_ciro', kind: 'cek', docId: v.docId }); }
          else { if (!v.accId) { CS.toast('Kasa/banka hesabı seçin. Ayarlar > Kasa ve banka bölümünden hesap ekleyin.', 'bad'); return false; } CS.payment({ dir, cid: v.cid, accId: v.accId, amount: v.amount, date: v.date, desc, method: v.method, projectId: v.projectId, docId: v.docId }); }
          CS.log(dir === 'in' ? 'Tahsilat' : 'Ödeme', `${c.name}: ${money(v.amount)}`); CS.save(); CS.toast('Kaydedildi. Yeni bakiye: ' + CS.balanceText(CS.balance(v.cid))); CS.route();
          if (dir === 'in') setTimeout(() => CS.confirm('Tahsilat makbuzu yazdırılsın mı?', () => receipt(c, v), 'Yazdır', 'primary'), 50);
        }
      }]
    });
  }
  CS.quickPayment = quickPayment;
  function receipt(c, v) { const co = CS.db.company; CS.printHTML(`<div class="hdr"><div><h1>Tahsilat makbuzu</h1><p>${esc(co.title || co.name)}<br>${esc(co.address)} ${esc(co.city)}</p></div><div class="box">Tarih: ${CS.date(v.date)}<br>No: ${CS.nextNo('TM')}</div></div><p>Sayın <b>${esc(c.title || c.name)}</b>'dan ${esc(v.desc || '')} karşılığı <b>${money(v.amount)}</b> (${esc(yaziyla(v.amount))}) tahsil edilmiştir.</p><p>Güncel bakiye: ${CS.balanceText(CS.balance(c.id))}</p><br><br><table><tr><td>Teslim eden</td><td class="r">Teslim alan / kaşe-imza</td></tr></table>`, 'Makbuz'); CS.save(); }

  /** Rakamı yazıya çevirir (TL) */
  function yaziyla(n) { const b = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'], o = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'], s = ['', 'bin', 'milyon', 'milyar']; const tri = (x) => { const y = Math.floor(x / 100), z = x % 100; return (y ? (y > 1 ? b[y] : '') + 'yüz' : '') + o[Math.floor(z / 10)] + b[z % 10]; }; const w = (x) => { if (!x) return 'sıfır'; let r = '', i = 0; while (x > 0) { const p = x % 1000; if (p) r = (i === 1 && p === 1 ? '' : tri(p)) + s[i] + r; x = Math.floor(x / 1000); i++; } return r; }; const tl = Math.floor(n), kr = Math.round((n - tl) * 100); return w(tl) + ' Türk lirası' + (kr ? ' ' + w(kr) + ' kuruş' : ''); }
  CS.yaziyla = yaziyla;

  /* ---------- Cari detay ---------- */
  function detail(page, id, prm) {
    const c = CS.contact(id); if (!c) { page.innerHTML = '<div class="blank"><h2>Cari bulunamadı</h2><a href="#contacts">Listeye dön</a></div>'; return; }
    const isSup = c.kind === 'tedarikci';
    const bal = CS.balance(c.id); const t = CS.today();
    const docs = CS.db.docs.filter((d) => d.cid === c.id);
    const sales = CS.sum(docs.filter((d) => ['satis', 'pos'].includes(d.type) && d.status !== 'iptal'), 'totalTry');
    const buys = CS.sum(docs.filter((d) => d.type === 'alis' && d.status !== 'iptal'), 'totalTry');
    const over = CS.sum(docs.filter((d) => ['satis', 'alis'].includes(d.type) && d.status !== 'iptal' && d.due && d.due < t), (d) => Math.max(0, d.totalTry - CS.docPaid(d)));
    const chq = CS.db.cheques.filter((x) => (x.cid === c.id || x.toCid === c.id) && ['portfoy', 'verildi', 'tahsilde', 'ciro'].includes(x.status));
    const body = CS.head(page, c.name, `<a class="btn" href="#contacts">Listeye dön</a>${CS.can('contacts', 'e') ? CS.btn('Düzenle', 'edit', '', 'edit') : ''}${CS.btn('Tahsilat', 'in', 'primary', 'down')}${CS.btn('Ödeme', 'out', '', 'up')}${CS.btn(isSup ? 'Alış faturası' : 'Satış faturası', 'inv', '', 'file')}${CS.btn('Teklif / sipariş', 'ord', '', 'clip')}${CS.btn('Hatırlat', 'rem', '', 'msg')}${CS.btn('Mutabakat', 'mut', '', 'check')}${CS.btn('Satış ekranında aç', 'pos', '', 'cart')}${c.dealer || c.lat ? CS.btn('Ziyaret kaydet', 'visit', 'tag', 'check') : ''}${c.lat ? `<a class="btn" target="_blank" rel="noopener" href="${CS.mapUrl(c.lat, c.lng)}">Haritada aç</a><a class="btn" target="_blank" rel="noopener" href="${CS.routeUrl(c.lat, c.lng)}">Yol tarifi</a>` : ''}`);
    body.innerHTML = `<div class="kpis">${CS.kpi('Bakiye', CS.balanceLabel(bal), bal > 0 ? 'Cari bize borçlu' : bal < 0 ? 'Biz cariye borçluyuz' : 'Hesap kapalı', 'hl')}${CS.kpi('Vadesi geçen', over ? `<span class="neg">${money(over)}</span>` : money(0), c.due ? c.due + ' gün vade' : '')}${CS.kpi('Toplam satış', money(sales), docs.filter((d) => ['satis', 'pos'].includes(d.type)).length + ' belge')}${CS.kpi('Toplam alış', money(buys))}${CS.kpi('Çek / senet', money(CS.sum(chq, 'amount')), chq.length + ' adet açık')}${CS.kpi('Risk limiti', c.limit ? money(c.limit) : 'Yok', c.limit ? 'Kalan ' + money(c.limit - Math.max(0, bal)) : '')}</div>
      <div class="grid g2" style="grid-template-columns:2fr 1fr"><section class="panel"><h2>Hesap ekstresi</h2><div id="rng" style="margin-bottom:10px"></div><div id="lt"></div></section>
      <section class="panel"><h2>Cari bilgileri</h2><div class="list">${[['Ünvan', c.title], ['Tür', KIND[c.kind]], ['Kategori', c.category], ['VKN / TCKN', c.taxNo || c.tc], ['Vergi dairesi', c.taxOffice], ['Telefon', c.phone], ['E-posta', c.email], ['Adres', [c.address, c.district, c.city].filter(Boolean).join(', ')], ['IBAN', c.iban], ['Fiyat listesi', CS.db.settings.priceLists[c.priceList || 0]], ['İskonto', c.discount ? '%' + c.discount : ''], ['e-Fatura', c.efatura ? 'Mükellef' : 'Değil (e-Arşiv)'], ['Yetkili', c.contactPerson]].filter((x) => x[1]).map(([k, v]) => `<div><span class="muted">${k}</span><b style="text-align:right">${esc(v)}</b></div>`).join('')}</div>${c.note ? `<p class="alert info">${esc(c.note)}</p>` : ''}
        <div class="row" style="margin-top:10px">${c.phone ? `<a class="btn sm" href="tel:${esc(c.phone)}">Ara</a><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/${waNum(c.phone)}">WhatsApp</a>` : ''}${c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}">E-posta</a>` : ''}</div>
        <h2 style="margin-top:16px">Belgeler</h2><div class="list">${docs.slice(-8).reverse().map((d) => `<div><a href="#docs/view/${d.id}">${esc(d.no)} · ${esc(CS.DOC_TYPES[d.type].short)}</a><span>${CS.date(d.date)} · ${money(d.total, d.currency)}</span></div>`).join('') || '<p class="empty">Belge yok.</p>'}</div>
        <h2 style="margin-top:16px">En çok aldığı ürünler</h2><div class="list">${Object.entries(CS.groupBy(docs.filter((d) => d.status !== 'iptal' && ['satis', 'pos', 'alis'].includes(d.type)).flatMap((d) => d.lines), (l) => l.pid || l.name)).map(([k, L]) => ({ k, q: CS.sum(L, (l) => CS.num(l.qty)), n: L[0].name })).sort((a, b) => b.q - a.q).slice(0, 6).map((x) => `<div><span>${esc(x.n)}</span><b>${CS.qty(x.q)}</b></div>`).join('') || '<p class="empty">—</p>'}</div>
        ${c.dealer || CS.db.visits.some((v) => v.cid === c.id) ? `<h2 style="margin-top:16px">Ziyaretler</h2><div class="timeline">${CS.db.visits.filter((v) => v.cid === c.id).slice(-8).reverse().map((v) => `<div>${CS.dateTime(v.at)} · ${esc(CS.userName(v.userId))} · ${esc(v.result || '')}${v.dist != null ? ` · <span class="${v.dist > 300 ? 'neg' : 'pos'}">${v.dist < 1000 ? Math.round(v.dist) + ' m' : CS.fmt2(v.dist / 1000) + ' km'}</span>` : ''}<br><span class="muted">${esc(v.note || '')}</span>${v.lat ? ` <a target="_blank" rel="noopener" href="${CS.mapUrl(v.lat, v.lng)}">konum</a>` : ''}</div>`).join('') || '<p class="muted">Henüz ziyaret yok.</p>'}</div>` : ''}
        <h2 style="margin-top:16px">İletişim geçmişi</h2><div class="timeline">${CS.db.smsLog.filter((s) => s.cid === c.id).slice(-8).reverse().map((s) => `<div>${CS.dateTime(s.at)} · ${esc(s.channel)}<br><span class="muted">${esc(s.text)}</span></div>`).join('') || '<p class="muted">Kayıt yok.</p>'}</div></section></div>`;
    let tbl;
    const rows = (a, b) => { const L = CS.db.ledger.filter((l) => l.cid === c.id).sort((x, y) => (x.date + x.at).localeCompare(y.date + y.at)); let run = CS.sum(L.filter((l) => l.date < a), 'amt'); const out = [{ date: a, desc: 'Devreden bakiye', amt: 0, run, open: true }]; L.filter((l) => l.date >= a && l.date <= b).forEach((l) => { run += l.amt; out.push({ ...l, run }); }); return out; };
    const r = CS.dateRange($('#rng', body), (a, b) => tbl.redraw(rows(a, b)), 'all');
    tbl = CS.table($('#lt', body), {
      rows: rows(...r.get()), search: false, pageSize: 100,
      tools: '', cols: [{ l: 'Tarih', k: 'date', f: (l) => CS.date(l.date) }, { l: 'Açıklama', k: 'desc', f: (l) => { const d = l.docId && CS.byId('docs', l.docId); return (l.open ? '<i>' : '') + esc(l.desc) + (l.open ? '</i>' : '') + (d && l.kind === 'belge' ? ` <a href="#docs/view/${d.id}">aç</a>` : '') + (l.due ? `<small>Vade ${CS.date(l.due)}</small>` : ''); } }, { l: 'Borç', a: 'r', v: (l) => (l.amt > 0 ? l.amt : 0), f: (l) => (l.amt > 0 ? CS.fmt2(l.amt) : '') }, { l: 'Alacak', a: 'r', v: (l) => (l.amt < 0 ? -l.amt : 0), f: (l) => (l.amt < 0 ? CS.fmt2(-l.amt) : '') }, { l: 'Bakiye', a: 'r', v: (l) => l.run, f: (l) => CS.balanceLabel(l.run) }],
      actions: (l) => (!l.open && ['tahsilat', 'odeme', 'virman', 'devir', 'duzeltme'].includes(l.kind) && CS.can('contacts', 'd') ? CS.actBtn('del', 'Hareketi sil', 'trash', 'danger') : ''),
      onAct: (a, l) => CS.confirm('Bu hareket (ve bağlı kasa/banka kaydı) silinsin mi?', () => { CS.db.ledger = CS.db.ledger.filter((x) => x.ref !== l.ref); CS.removeAccMovesByRef(l.ref); CS.log('Cari hareket silindi', c.name + ': ' + l.desc); CS.save(); CS.route(); })
    });
    const tools = document.createElement('div'); tools.className = 'row'; tools.style.marginTop = '8px';
    tools.innerHTML = `${CS.btn('Ekstre yazdır / PDF', 'pst', 'sm', 'print')}${CS.btn('Excel', 'xst', 'sm', 'down')}${CS.btn('Ekstreyi paylaş', 'share', 'sm', 'send')}${CS.can('contacts', 'e') ? CS.btn('Bakiye düzeltme', 'fix', 'sm', 'edit') : ''}`;
    $('#lt', body).appendChild(tools);
    CS.bind(page, {
      edit: () => contactForm(c), in: () => quickPayment('in', c.id), out: () => quickPayment('out', c.id),
      inv: () => CS.go('docs/new/' + (isSup ? 'alis' : 'satis') + '?cid=' + c.id), ord: () => CS.go('orders/new/' + (isSup ? 'alis_siparis' : 'teklif') + '?cid=' + c.id),
      rem: () => remind(c), mut: () => reconciliation(c), pos: () => { CS.posDraft = { cid: c.id, list: CS.num(c.priceList) }; CS.go('pos'); }, visit: () => CS.visitDialog(c),
      pst: () => statement(c, ...r.get()), xst: () => { const L = rows(...r.get()); CS.exportXLS('ekstre-' + c.name, ['Tarih', 'Açıklama', 'Borç', 'Alacak', 'Bakiye'], L.map((l) => [CS.date(l.date), l.desc, l.amt > 0 ? l.amt : '', l.amt < 0 ? -l.amt : '', l.run])); },
      share: () => shareStatement(c),
      fix: () => { const f = CS.form([{ k: 'dir', l: 'Yön', t: 'select', opts: [['borc', 'Cariyi borçlandır'], ['alacak', 'Cariyi alacaklandır']] }, { k: 'amt', l: 'Tutar', t: 'money', req: true }, { k: 'date', l: 'Tarih', t: 'date', def: CS.today() }, { k: 'desc', l: 'Açıklama', def: 'Bakiye düzeltme' }]); CS.modal({ title: 'Bakiye düzeltme / devir', size: 'sm', body: f, buttons: [{ label: 'Vazgeç' }, { label: 'Kaydet', kind: 'primary', onClick: () => { const v = f.read(); if (!v) return false; CS.addLedger({ cid: c.id, amt: v.dir === 'borc' ? v.amt : -v.amt, date: v.date, desc: v.desc, ref: 'fix_' + CS.uid(), kind: 'duzeltme' }); CS.log('Cari bakiye düzeltme', c.name); CS.save(); CS.route(); } }] }); }
    });
  }
  const waNum = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '9' + d; else if (d.length === 10) d = '90' + d; return d; };
  CS.waNum = waNum;

  function statement(c, a, b) {
    const co = CS.db.company; const L = CS.db.ledger.filter((l) => l.cid === c.id).sort((x, y) => (x.date + x.at).localeCompare(y.date + y.at)); let run = CS.sum(L.filter((l) => l.date < a), 'amt'); const open = run;
    const rows = L.filter((l) => l.date >= a && l.date <= b).map((l) => { run += l.amt; return `<tr><td>${CS.date(l.date)}</td><td>${esc(l.desc)}${l.due ? ' <span class="muted">(vade ' + CS.date(l.due) + ')</span>' : ''}</td><td class="r">${l.amt > 0 ? CS.fmt2(l.amt) : ''}</td><td class="r">${l.amt < 0 ? CS.fmt2(-l.amt) : ''}</td><td class="r">${CS.fmt2(Math.abs(run))} ${run >= 0 ? '(B)' : '(A)'}</td></tr>`; }).join('');
    CS.printHTML(`<div class="hdr"><div><h1>Cari hesap ekstresi</h1><p><b>${esc(co.title || co.name)}</b><br>${esc(co.address)} ${esc(co.city)}<br>${esc(co.phone)}</p></div><div class="box"><b>${esc(c.title || c.name)}</b><br>${esc(c.address || '')} ${esc(c.city || '')}<br>${c.taxNo ? 'VKN: ' + esc(c.taxNo) + ' ' + esc(c.taxOffice || '') : c.tc ? 'TCKN: ' + esc(c.tc) : ''}<br>Dönem: ${CS.date(a === '2000-01-01' ? (L[0]?.date || a) : a)} – ${CS.date(b)}</div></div><table><tr><th>Tarih</th><th>Açıklama</th><th class="r">Borç</th><th class="r">Alacak</th><th class="r">Bakiye</th></tr><tr><td></td><td><i>Devreden bakiye</i></td><td></td><td></td><td class="r">${CS.fmt2(Math.abs(open))}</td></tr>${rows}<tr class="tot"><td colspan="4">Bakiye</td><td class="r">${CS.fmt2(Math.abs(run))} ${run >= 0 ? '(B)' : '(A)'}</td></tr></table><p class="muted">(B): cari borçlu · (A): cari alacaklı. ${co.iban ? 'IBAN: ' + esc(co.iban) : ''}</p>`, 'Ekstre ' + c.name);
  }
  function fill(tpl, c) { return tpl.replace('{ad}', c.title || c.name).replace('{firma}', CS.db.company.name).replace('{bakiye}', CS.balanceText(CS.balance(c.id))).replace('{iban}', CS.db.company.iban || '').replace('{tutar}', CS.money(Math.abs(CS.balance(c.id)))); }
  function remind(c) {
    const text = fill(CS.db.settings.smsTemplate, c);
    const m = CS.modal({ title: 'Ödeme hatırlatması — ' + c.name, body: `<label class="fld full"><span>Mesaj</span><textarea id="rt" rows="5" style="width:100%">${esc(text)}</textarea></label><p class="muted">Gönderim kanalını seçin. SMS sağlayıcısı (Entegrasyonlar) tanımlıysa toplu SMS de gönderilebilir.</p>`, buttons: [{ label: 'Vazgeç' }, { label: 'E-posta', onClick: (x, el) => send('E-posta', `mailto:${c.email || ''}?subject=${encodeURIComponent('Bakiye bilgilendirme')}&body=${encodeURIComponent($('#rt', el).value)}`, el) }, { label: 'SMS', onClick: (x, el) => send('SMS', `sms:${c.phone || ''}?body=${encodeURIComponent($('#rt', el).value)}`, el) }, { label: 'WhatsApp', kind: 'primary', onClick: (x, el) => send('WhatsApp', `https://wa.me/${waNum(c.phone)}?text=${encodeURIComponent($('#rt', el).value)}`, el) }] });
    function send(ch, url, el) { CS.db.smsLog.push({ id: CS.uid(), at: CS.now(), cid: c.id, channel: ch, text: $('#rt', el).value, user: CS.user.name }); CS.save(); window.open(url, '_blank'); }
  }
  CS.remind = remind;
  function bulkRemind(list) {
    if (!list.length) return CS.toast('Bakiyesi alacak olan cari yok.', 'bad');
    const m = CS.modal({ title: `Toplu hatırlatma (${list.length} cari)`, size: 'lg', body: `<p class="muted">Şablon: Ayarlar > Genel bölümünden düzenlenir. Her satırdaki bağlantı WhatsApp’ta mesajı hazır açar.</p><div class="list">${list.map((c) => `<div><span><b>${esc(c.name)}</b> · ${CS.balanceText(CS.balance(c.id))}</span><span>${c.phone ? `<a target="_blank" rel="noopener" data-log="${c.id}" href="https://wa.me/${waNum(c.phone)}?text=${encodeURIComponent(fill(CS.db.settings.smsTemplate, c))}">WhatsApp</a> · <a data-log="${c.id}" href="sms:${esc(c.phone)}?body=${encodeURIComponent(fill(CS.db.settings.smsTemplate, c))}">SMS</a>` : '<span class="muted">Telefon yok</span>'}</span></div>`).join('')}</div>`, buttons: [{ label: 'Listeyi CSV indir (SMS paneli için)', onClick: () => { CS.exportCSV('hatirlatma-listesi', ['Telefon', 'Mesaj'], list.filter((c) => c.phone).map((c) => [c.phone, fill(CS.db.settings.smsTemplate, c)])); return false; } }, { label: 'Kapat' }] });
    m.el.addEventListener('click', (e) => { const a = e.target.closest('[data-log]'); if (a) { CS.db.smsLog.push({ id: CS.uid(), at: CS.now(), cid: a.dataset.log, channel: a.textContent, text: 'Toplu hatırlatma', user: CS.user.name }); CS.save(); } });
  }
  function shareStatement(c) {
    const L = CS.db.ledger.filter((l) => l.cid === c.id).sort((a, b) => a.date.localeCompare(b.date)).slice(-15);
    const txt = `${CS.db.company.name} — ${c.name} hesap özeti\n` + L.map((l) => `${CS.date(l.date)} ${l.desc}: ${l.amt > 0 ? '+' : ''}${CS.fmt2(l.amt)}`).join('\n') + `\nGüncel bakiye: ${CS.balanceText(CS.balance(c.id))}` + (CS.db.company.iban ? `\nIBAN: ${CS.db.company.iban}` : '');
    CS.modal({ title: 'Ekstreyi paylaş', body: `<textarea id="sx" rows="12" style="width:100%">${esc(txt)}</textarea>`, buttons: [{ label: 'Kopyala', onClick: (x, el) => { navigator.clipboard?.writeText($('#sx', el).value); CS.toast('Panoya kopyalandı.'); return false; } }, { label: 'E-posta', onClick: (x, el) => window.open(`mailto:${c.email || ''}?subject=Hesap%20ekstresi&body=${encodeURIComponent($('#sx', el).value)}`) }, { label: 'WhatsApp', kind: 'primary', onClick: (x, el) => { CS.db.smsLog.push({ id: CS.uid(), at: CS.now(), cid: c.id, channel: 'WhatsApp', text: 'Ekstre paylaşıldı', user: CS.user.name }); CS.save(); window.open(`https://wa.me/${waNum(c.phone)}?text=${encodeURIComponent($('#sx', el).value)}`); } }] });
  }
  function reconciliation(c) {
    const f = CS.form([{ k: 'date', l: 'Mutabakat tarihi', t: 'date', def: CS.today() }, { k: 'type', l: 'Tür', t: 'select', opts: [['cari', 'Cari hesap mutabakatı'], ['ba', 'BA formu mutabakatı (alış)'], ['bs', 'BS formu mutabakatı (satış)']] }, { k: 'month', l: 'Dönem (BA/BS için)', t: 'month', def: CS.today().slice(0, 7) }]);
    CS.modal({ title: 'Mutabakat mektubu', size: 'sm', body: f, buttons: [{ label: 'Vazgeç' }, { label: 'Oluştur', kind: 'primary', onClick: () => { const v = f.read(); const co = CS.db.company; let content; if (v.type === 'cari') { const b = CS.balance(c.id, v.date); content = `<p>${CS.date(v.date)} tarihi itibarıyla kayıtlarımıza göre hesabınız <b>${CS.money(Math.abs(b))}</b> ${b >= 0 ? 'BORÇ' : 'ALACAK'} bakiyesi vermektedir.</p>`; } else { const types = v.type === 'ba' ? ['alis'] : ['satis']; const ds = CS.db.docs.filter((d) => d.cid === c.id && types.includes(d.type) && d.status !== 'iptal' && d.date.startsWith(v.month)); content = `<p>${v.month} dönemine ait ${v.type.toUpperCase()} formu bildirimimiz: <b>${ds.length}</b> adet belge, KDV hariç toplam <b>${CS.money(CS.sum(ds, 'net'))}</b>.</p>`; } CS.printHTML(`<div class="hdr"><div><h1>Mutabakat mektubu</h1><p>${esc(co.title || co.name)}<br>${esc(co.address)} ${esc(co.city)}<br>VKN: ${esc(co.taxNo)}</p></div><div class="box">Sayın <b>${esc(c.title || c.name)}</b><br>${esc(c.address || '')}<br>${c.taxNo ? 'VKN: ' + esc(c.taxNo) : ''}</div></div>${content}<p>Mutabık olup olmadığınızı aşağıdaki bölümü doldurarak 15 gün içinde bildirmenizi rica ederiz. Süresi içinde yanıt verilmemesi halinde mutabık sayılacağınızı hatırlatırız.</p><br><table><tr><td>☐ Mutabıkız</td><td>☐ Mutabık değiliz — bakiyemiz: ............</td></tr><tr><td><br>Kaşe / imza</td><td><br>Tarih</td></tr></table>`, 'Mutabakat'); } }] });
  }

  /* ---------- Virman ---------- */
  function virman(body) {
    body.innerHTML = `<div class="grid g2"><section class="panel"><h2>Cariler arası virman</h2><p class="muted">Bir carinin bakiyesini diğerine aktarır (ör. müşterinin borcunu tedarikçiye olan borcunuzdan mahsup etmek).</p><div id="vf"></div><p><button class="btn primary" data-a="go">Virmanı kaydet</button></p></section><section class="panel"><h2>Geçmiş virmanlar</h2><div class="list">${CS.db.ledger.filter((l) => l.kind === 'virman' && l.amt > 0).slice(-20).reverse().map((l) => `<div><span>${CS.date(l.date)} · ${esc(l.desc)}</span><b>${money(l.amt)}</b></div>`).join('') || '<p class="empty">Virman yok.</p>'}</div></section></div>`;
    const f = CS.form([{ k: 'from', l: 'Borçlandırılacak cari', t: 'select', opts: CS.contactOptions(null), req: true, w: 'full' }, { k: 'to', l: 'Alacaklandırılacak cari', t: 'select', opts: CS.contactOptions(null), req: true, w: 'full' }, { k: 'amount', l: 'Tutar', t: 'money', req: true }, { k: 'date', l: 'Tarih', t: 'date', def: CS.today() }, { k: 'desc', l: 'Açıklama', w: 'full' }]);
    $('#vf', body).appendChild(f);
    CS.bind(body, { go: () => { const v = f.read(); if (!v) return; if (v.from === v.to) return CS.toast('Aynı cari seçilemez.', 'bad'); const ref = 'vir_' + CS.uid(); const d = v.desc || `Virman: ${CS.contactName(v.from)} → ${CS.contactName(v.to)}`; CS.addLedger({ cid: v.from, amt: v.amount, date: v.date, desc: d, ref, kind: 'virman' }); CS.addLedger({ cid: v.to, amt: -v.amount, date: v.date, desc: d, ref, kind: 'virman' }); CS.log('Cari virman', d + ' ' + money(v.amount)); CS.save(); CS.toast('Virman kaydedildi.'); CS.route(); } });
  }
  function cats(body) {
    body.innerHTML = `<section class="panel" style="max-width:520px"><h2>Cari kategorileri</h2><div class="list">${CS.db.contactCats.map((c, i) => `<div><span>${esc(c)} <small class="muted">${CS.db.contacts.filter((x) => x.category === c).length} cari</small></span><button class="icon-btn danger" data-d="${i}" aria-label="Sil">${icon('trash', 15)}</button></div>`).join('')}</div><div class="row" style="margin-top:8px"><input id="cn" placeholder="Yeni kategori" style="flex:1"><button class="btn" data-a="add">Ekle</button></div></section>`;
    CS.bind(body, { add: () => { const v = $('#cn', body).value.trim(); if (v) { CS.db.contactCats.push(v); CS.save(); CS.route(); } } });
    body.addEventListener('click', (e) => { const d = e.target.closest('[data-d]'); if (d) { CS.db.contactCats.splice(+d.dataset.d, 1); CS.save(); CS.route(); } });
  }
  function importContacts() {
    const cols = ['Ad', 'Ünvan', 'Tür', 'Vergi no', 'TC', 'Vergi dairesi', 'Telefon', 'E-posta', 'Adres', 'İl', 'Kategori', 'Bakiye'];
    CS.modal({ title: 'Carileri içe aktar', body: `<p class="muted">Sütunlar: ${cols.join(', ')}. Tür: müşteri/tedarikçi. Bakiye: pozitif = cari borçlu, negatif = biz borçluyuz.</p><p><button class="btn sm" id="ctpl">Şablon indir</button></p><input type="file" id="cf" accept=".csv,.txt"><p class="muted">ya da Excel’den yapıştırın:</p><textarea id="cpt" rows="6" style="width:100%"></textarea>`, buttons: [{ label: 'Vazgeç' }, {
      label: 'İçe aktar', kind: 'primary', onClick: async (x, el) => {
        let rows; const file = $('#cf', el).files[0]; if (file) rows = CS.parseCSV(await file.text()); else rows = $('#cpt', el).value.split(/\r?\n/).map((l) => l.split('\t'));
        rows = rows.filter((r) => r.some((c) => String(c).trim())); if (rows.length < 2) { CS.toast('Veri yok.', 'bad'); return false; }
        const h = rows[0].map((c) => CS.trLower(c.trim())); const ix = (n) => h.indexOf(CS.trLower(n)); let n = 0;
        rows.slice(1).forEach((r) => { const g = (k) => (ix(k) >= 0 ? String(r[ix(k)] ?? '').trim() : ''); if (!g('Ad')) return; const c = { id: 'c_' + CS.uid(), name: g('Ad'), title: g('Ünvan'), kind: CS.match(g('Tür'), 'tedarik') ? 'tedarikci' : 'musteri', taxNo: g('Vergi no'), tc: g('TC'), taxOffice: g('Vergi dairesi'), phone: g('Telefon'), email: g('E-posta'), address: g('Adres'), city: g('İl'), category: g('Kategori'), createdAt: CS.today(), priceList: 0 }; CS.db.contacts.push(c); const b = CS.num(g('Bakiye')); if (b) CS.addLedger({ cid: c.id, amt: b, desc: 'Açılış bakiyesi (devir)', ref: 'open_' + c.id, kind: 'devir' }); n++; });
        CS.log('Cari içe aktarıldı', n + ' cari'); CS.save(); CS.toast(n + ' cari eklendi.'); CS.route();
      }
    }], onOpen: (el) => { $('#ctpl', el).onclick = () => CS.exportCSV('cari-sablonu', cols, [['Örnek Ltd', 'Örnek Ticaret Ltd. Şti.', 'müşteri', '1234567890', '', 'Kadıköy', '05550000000', 'a@b.com', 'Adres', 'İstanbul', 'Toptan', '1500']]); } });
  }

  /* ---------- Çek kaydı yardımcı (finans modülü de kullanır) ---------- */
  CS.addCheque = function (o) {
    const ch = Object.assign({ id: 'ch_' + CS.uid(), status: o.dir === 'alinan' ? 'portfoy' : 'verildi', history: [] }, o);
    ch.history.push({ date: o.date, status: ch.status, note: o.dir === 'alinan' ? 'Cariden alındı' : 'Cariye verildi' });
    CS.db.cheques.push(ch);
    if (o.cid) CS.addLedger({ cid: o.cid, amt: o.dir === 'alinan' ? -o.amount : o.amount, date: o.date, desc: `${o.kind === 'cek' ? 'Çek' : 'Senet'} ${o.dir === 'alinan' ? 'alındı' : 'verildi'} ${o.no || ''} (vade ${CS.date(o.due)})`, ref: ch.id, kind: 'cek', docId: o.docId });
    return ch;
  };

  /* ================= BAYİ, KONUM, ZİYARET ================= */
  CS.mapUrl = (la, ln) => `https://www.google.com/maps?q=${la},${ln}`;
  CS.routeUrl = (la, ln) => `https://www.google.com/maps/dir/?api=1&destination=${la},${ln}`;
  CS.distance = (a, b, c, d) => { const R = 6371000, r = Math.PI / 180; const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  CS.getLocation = () => new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Bu cihaz konum vermiyor.'));
    if (location.protocol === 'http:' && !/^(localhost|127\.)/.test(location.hostname)) return rej(new Error('Konum için site https:// ile açılmalı (cPanel > SSL).'));
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), (e) => rej(new Error(e.code === 1 ? 'Konum izni verilmedi. Tarayıcı ayarlarından bu siteye konum izni verin.' : 'Konum alınamadı: ' + e.message)), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
  CS.visitDialog = function (c) {
    const f = CS.form([{ k: 'result', l: 'Ziyaret sonucu', t: 'select', opts: ['Ziyaret edildi', 'Sipariş alındı', 'Tahsilat yapıldı', 'Teslimat yapıldı', 'Yetkili yoktu', 'Kapalıydı', 'Şikâyet / iade'] }, { k: 'note', l: 'Not', t: 'textarea', w: 'full' }, { k: 'saveLoc', l: 'Bayinin kayıtlı konumu yoksa bu konumu bayi konumu olarak kaydet', t: 'check', def: !c.lat, w: 'full' }]);
    const info = document.createElement('p'); info.className = 'alert info'; info.textContent = 'Konum alınıyor…'; const box = document.createElement('div'); box.append(info, f);
    let loc = null; CS.getLocation().then((g) => { loc = g; const d = c.lat ? CS.distance(g.lat, g.lng, CS.num(c.lat), CS.num(c.lng)) : null; info.innerHTML = `Konumunuz alındı (±${Math.round(g.acc)} m).${d != null ? ` Bayiye uzaklık: <b class="${d > 300 ? 'neg' : 'pos'}">${d < 1000 ? Math.round(d) + ' m' : CS.fmt2(d / 1000) + ' km'}</b>${d > 300 ? ' — bayinin yanında değilsiniz.' : ''}` : ''}`; }).catch((e) => { info.className = 'alert'; info.textContent = e.message + ' Ziyaret konumsuz kaydedilir.'; });
    CS.modal({ title: 'Ziyaret kaydet — ' + c.name, body: box, buttons: [{ label: 'Vazgeç' }, { label: 'Kaydet', kind: 'primary', onClick: () => { const v = f.read(); const d = loc && c.lat ? CS.distance(loc.lat, loc.lng, CS.num(c.lat), CS.num(c.lng)) : null; CS.db.visits.push({ id: 'vs_' + CS.uid(), cid: c.id, at: CS.now(), date: CS.today(), userId: CS.user.id, result: v.result, note: v.note, lat: loc?.lat, lng: loc?.lng, acc: loc?.acc, dist: d }); if (loc && v.saveLoc && !c.lat) { c.lat = CS.round(loc.lat, 6); c.lng = CS.round(loc.lng, 6); } CS.log('Bayi ziyareti', c.name + ' — ' + v.result); CS.save(); CS.toast('Ziyaret kaydedildi.'); CS.route(); } }] });
  };
  function dealers(body) {
    const t = CS.today(); const m0 = t.slice(0, 8) + '01'; let me = null;
    const ds = () => CS.db.contacts.filter((c) => c.dealer && !c.archived);
    const lastV = (c) => CS.db.visits.filter((v) => v.cid === c.id).reduce((a, b) => (!a || b.at > a.at ? b : a), null);
    const sales = (c, a) => CS.sum(CS.saleLines(a, t, (d) => d.cid === c.id), 'total');
    body.innerHTML = `<div class="kpis">${CS.kpi('Bayi sayısı', ds().length, ds().filter((c) => c.lat).length + ' bayinin konumu kayıtlı', 'hl')}${CS.kpi('Bu ay bayi satışı', money(CS.sum(ds(), (c) => sales(c, m0))))}${CS.kpi('Bayi alacakları', money(CS.sum(ds(), (c) => Math.max(0, CS.balance(c.id)))))}${CS.kpi('Bu ay ziyaret', CS.db.visits.filter((v) => v.date >= m0).length)}</div><div id="dt"></div>`;
    const tbl = CS.table($('#dt', body), {
      rows: ds(), empty: 'Henüz bayi yok. “Yeni bayi” ile ekleyin ya da cari kartında “Bu cari bir bayidir” seçeneğini işaretleyin.',
      tools: `<button class="btn" id="near">${CS.icon('search', 15)} Yakınımdaki bayiler</button><a class="btn" href="#reports/dealers">${CS.icon('chart', 15)} Bayi raporu</a>`,
      cols: [{ l: 'Bayi', v: (c) => c.name, f: (c) => `<b>${esc(c.name)}</b><small>${esc([c.region, c.city, c.phone].filter(Boolean).join(' · '))}</small>` }, { l: 'Fiyat', v: (c) => CS.db.settings.priceLists[c.priceList || 0] || '' }, { l: 'Bu ay satış', a: 'r', v: (c) => sales(c, m0), f: (c) => CS.fmt2(sales(c, m0)) }, { l: 'Bakiye', a: 'r', v: (c) => CS.balance(c.id), f: (c) => CS.balanceLabel(CS.balance(c.id)) }, { l: 'Son ziyaret', v: (c) => lastV(c)?.at || '', f: (c) => { const v = lastV(c); if (!v) return '<span class="muted">Yok</span>'; const g = CS.daysBetween(v.date, t); return `${CS.date(v.date)} <small class="${g > 14 ? 'neg' : ''}">${g} gün önce</small>`; } }, { l: 'Uzaklık', a: 'r', v: (c) => (me && c.lat ? CS.distance(me.lat, me.lng, CS.num(c.lat), CS.num(c.lng)) : 1e12), f: (c) => (me && c.lat ? (() => { const d = CS.distance(me.lat, me.lng, CS.num(c.lat), CS.num(c.lng)); return d < 1000 ? Math.round(d) + ' m' : CS.fmt2(d / 1000) + ' km'; })() : c.lat ? '<span class="muted">konum var</span>' : '<span class="muted">konum yok</span>') }],
      onRow: (c) => CS.go('contacts/' + c.id),
      actions: (c) => CS.actBtn('visit', 'Ziyaret kaydet', 'check') + (c.lat ? CS.actBtn('map', 'Yol tarifi', 'send') : '') + CS.actBtn('pos', 'Satış yap', 'cart'),
      onAct: (a, c) => { if (a === 'visit') CS.visitDialog(c); if (a === 'map') window.open(CS.routeUrl(c.lat, c.lng), '_blank'); if (a === 'pos') { CS.posDraft = { cid: c.id, list: CS.num(c.priceList) }; CS.go('pos'); } }
    });
    $('#near', body).onclick = async (e) => { e.target.disabled = true; try { me = await CS.getLocation(); tbl.state.sort = 5; tbl.state.dir = 1; tbl.redraw(); CS.toast('Bayiler size olan uzaklığa göre sıralandı.'); } catch (err) { CS.toast(err.message, 'bad', 5000); } e.target.disabled = false; };
  }
  function visitsList(body) {
    body.innerHTML = '<div id="rng" style="margin-bottom:10px"></div><div id="vt"></div>';
    let t; const rows = (a, b) => CS.db.visits.filter((v) => v.date >= a && v.date <= b).sort((x, y) => y.at.localeCompare(x.at));
    const r = CS.dateRange($('#rng', body), (a, b) => t.redraw(rows(a, b)), 'month');
    t = CS.table($('#vt', body), { rows: rows(...r.get()), empty: 'Bu dönemde ziyaret yok.', tools: `<button class="btn" id="vx">${CS.icon('down', 15)} Excel</button>`, cols: [{ l: 'Zaman', k: 'at', f: (v) => CS.dateTime(v.at) }, { l: 'Bayi', v: (v) => CS.contactName(v.cid) }, { l: 'Personel', v: (v) => CS.userName(v.userId) }, { l: 'Sonuç', k: 'result' }, { l: 'Bayiye uzaklık', a: 'r', v: (v) => v.dist ?? 1e12, f: (v) => (v.dist == null ? '<span class="muted">—</span>' : `<span class="${v.dist > 300 ? 'neg' : 'pos'}">${v.dist < 1000 ? Math.round(v.dist) + ' m' : CS.fmt2(v.dist / 1000) + ' km'}</span>`) }, { l: 'Not', k: 'note' }, { l: 'Konum', f: (v) => (v.lat ? `<a target="_blank" rel="noopener" href="${CS.mapUrl(v.lat, v.lng)}">Haritada</a>` : '') }], onRow: (v) => CS.go('contacts/' + v.cid) });
    $('#vx', body).onclick = () => CS.exportXLS('bayi-ziyaretleri', ['Zaman', 'Bayi', 'Personel', 'Sonuç', 'Uzaklık (m)', 'Enlem', 'Boylam', 'Not'], t.rows().map((v) => [CS.dateTime(v.at), CS.contactName(v.cid), CS.userName(v.userId), v.result, v.dist == null ? '' : Math.round(v.dist), v.lat || '', v.lng || '', v.note || '']));
  }
})();
