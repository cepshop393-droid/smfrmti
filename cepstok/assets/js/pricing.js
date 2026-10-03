/* CepStok — döviz kurları (Harem Altın / TCMB / elle), dövizli ürün, kâr marjı ve bayi fiyatlarının otomatik hesabı */
(function () {
  const { $, esc } = CS;
  CS.FX = ['₺', 'USD', 'EUR', 'GBP'];
  CS.FX_SIGN = { '₺': '₺', USD: '$', EUR: '€', GBP: '£' };
  CS.rates = CS.ls.get('cepstok:rates', null);

  /** 1 birim dövizin TL karşılığı */
  CS.rate = function (cur) {
    if (!cur || cur === '₺' || cur === 'TL' || cur === 'TRY') return 1;
    const s = CS.db?.settings || {}; const man = CS.num(s.rateManual?.[cur]);
    if (s.rateMode === 'manual' && man) return man;
    const r = CS.rates?.[cur]; const v = r ? CS.num(r[s.rateSide === 'alis' ? 'alis' : 'satis']) : 0;
    return v || man || 0;
  };
  CS.fxMoney = (v, cur) => (cur && cur !== '₺' ? CS.FX_SIGN[cur] + ' ' + CS.fmt2(v) : CS.money(v));

  function roundPrice(v) {
    const r = String(CS.db?.settings?.priceRound || ''); if (!r || !v) return CS.round(v, 2);
    if (r === '0.99') return Math.max(0.99, Math.ceil(v) - 0.01);
    const s = +r; return CS.round(Math.ceil(v / s - 1e-9) * s, 2);
  }
  /** Dövizli / marjlı ürünün TL alış, perakende ve 3 bayi fiyatını hesaplar */
  CS.applyPricing = function (p) {
    if (!p || (p.variants?.length && !p.cur)) return p;
    if (CS.server && CS.canCost && !CS.canCost()) return p; // maliyeti görmeyen kullanıcıda fiyatlar sunucudan hazır gelir
    const cur = p.cur || '₺'; const fx = cur !== '₺'; const rate = CS.rate(cur);
    if (fx && !rate) return p; // kur yokken mevcut değerleri koru
    if (fx) p.buy = CS.round(CS.num(p.buyFx) * rate, 4);
    const lists = (CS.db?.settings?.priceLists || []).length || 4;
    const kdvMul = CS.db?.settings?.priceIncludesKdv ? 1 + CS.num(p.kdv) / 100 : 1;
    const fromMargin = (m) => roundPrice(CS.num(p.buy) * (1 + CS.num(m) / 100) * kdvMul);
    if (p.autoPrice && p.margin !== '' && p.margin != null) p.sell = fromMargin(p.margin);
    else if (fx && CS.num(p.sellFx)) p.sell = roundPrice(CS.num(p.sellFx) * rate);
    p.prices = p.prices || [];
    p.prices[0] = CS.num(p.sell);
    (p.dealers || []).forEach((d, i) => {
      if (i + 1 >= Math.max(lists, 4)) return; if (!d) return;
      if (d.m !== '' && d.m != null && CS.num(d.m) !== 0 || (d.m === 0 && !CS.num(d.p))) p.prices[i + 1] = fromMargin(d.m);
      else if (CS.num(d.p)) p.prices[i + 1] = roundPrice(CS.num(d.p) * (fx ? rate : 1));
    });
    return p;
  };
  CS.applyAllPricing = function () { if (!CS.db) return; CS.db.products.forEach((p) => { if ((p.cur && p.cur !== '₺') || p.autoPrice || p.dealers) CS.applyPricing(p); }); };
  /** Ürünün o anki kâr marjı (KDV hariç satış / alış) */
  CS.marginOf = (p, list = 0) => { const b = CS.num(p.buy); return b ? ((CS.netPrice(p, list) - b) / b) * 100 : 0; };

  /* ---------- Kurları getir ---------- */
  let rateTimer;
  CS.loadRates = async function (force) {
    clearTimeout(rateTimer);
    if (CS.server) {
      try { const r = await CS.api('rates', { force: !!force }, 15000); CS.rates = r; CS.ls.set('cepstok:rates', r); CS.applyAllPricing(); CS.rateChip(); if (force) CS.toast(`Kurlar güncellendi (${r.source}).`); }
      catch (e) { if (force) CS.toast(e.message, 'bad', 5000); }
      rateTimer = setTimeout(() => CS.loadRates(), 5 * 60 * 1000);
    } else { CS.applyAllPricing(); CS.rateChip(); if (force) CS.toast('Sunucu olmadan otomatik kur alınamaz. Ayarlar > Döviz kurları bölümünden elle kur girin.', 'warn', 5000); }
  };
  CS.rateChip = function () {
    const el = $('#ratechip'); if (!el) return; const u = CS.rate('USD'), e = CS.rate('EUR');
    el.textContent = u ? `$ ${CS.fmt2(u)}${e ? '  € ' + CS.fmt2(e) : ''}` : 'Kur yok';
    el.title = CS.rates ? `${CS.rates.source} · ${CS.dateTime(CS.rates.at)} · ${CS.db.settings.rateSide === 'alis' ? 'alış' : 'satış'} kuru${CS.db.settings.rateMode === 'manual' ? ' (elle)' : ''}` : 'Kur bilgisi yok';
  };
  CS.ratesDialog = function () {
    const s = CS.db.settings; s.rateManual = s.rateManual || {};
    const rows = ['USD', 'EUR', 'GBP'].map((c) => `<tr><td><b>${c}</b></td><td class="r">${CS.rates?.[c] ? CS.fmt2(CS.rates[c].alis) : '—'}</td><td class="r">${CS.rates?.[c] ? CS.fmt2(CS.rates[c].satis) : '—'}</td><td class="r"><input data-man="${c}" value="${s.rateManual[c] ? CS.fmt2(s.rateManual[c]) : ''}" style="width:100px;text-align:right" inputmode="decimal" aria-label="${c} elle kur"></td><td class="r"><b>${CS.fmt2(CS.rate(c))}</b></td></tr>`).join('');
    const m = CS.modal({ title: 'Döviz kurları', body: `<p class="muted">Kaynak: ${esc(CS.rates?.source || '—')} · ${CS.dateTime(CS.rates?.at)}. Kurlar 5 dakikada bir yenilenir; dövizli ürünlerin TL fiyatları ve kâr marjlı fiyatlar otomatik yeniden hesaplanır.</p><table class="tbl"><tr><th>Döviz</th><th class="r">Alış</th><th class="r">Satış</th><th class="r">Elle kur</th><th class="r">Kullanılan</th></tr>${rows}</table><div class="form-grid" style="margin-top:12px"><label class="fld third"><span>Kullanılacak kur</span><select id="rs"><option value="satis" ${s.rateSide !== 'alis' ? 'selected' : ''}>Satış kuru</option><option value="alis" ${s.rateSide === 'alis' ? 'selected' : ''}>Alış kuru</option></select></label><label class="fld third"><span>Kaynak</span><select id="rm"><option value="auto" ${s.rateMode !== 'manual' ? 'selected' : ''}>Otomatik (Harem Altın)</option><option value="manual" ${s.rateMode === 'manual' ? 'selected' : ''}>Elle girilen kur</option></select></label><label class="fld third"><span>Fiyat yuvarlama</span><select id="rr">${[['', 'Yok (kuruşlu)'], ['0.05', '0,05'], ['0.1', '0,10'], ['0.5', '0,50'], ['1', '1 ₺'], ['5', '5 ₺'], ['0.99', ',99 ile bitir']].map(([v, l]) => `<option value="${v}" ${String(s.priceRound || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>`, buttons: [{ label: 'Şimdi yenile', onClick: () => { CS.loadRates(true).then(() => { m.close(); CS.ratesDialog(); }); return false; } }, { label: 'Vazgeç' }, { label: 'Kaydet', kind: 'primary', onClick: (c, el) => { s.rateSide = $('#rs', el).value; s.rateMode = $('#rm', el).value; s.priceRound = $('#rr', el).value; el.querySelectorAll('[data-man]').forEach((i) => (s.rateManual[i.dataset.man] = CS.num(i.value))); CS.applyAllPricing(); CS.log('Kur ayarları değişti'); CS.save(); CS.rateChip(); CS.route(); } }] });
  };
})();
