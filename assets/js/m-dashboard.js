/* Özet ekranı */
(function () {
  const { esc, money, icon } = CS;
  CS.mod('dashboard', {
    title: 'Özet',
    render(page) {
      const t = CS.today(); const br = CS.branchId; const cc = CS.canCost(); const fb = (d) => !br || d.branchId === br;
      const todayL = CS.saleLines(t, t, fb); const monthL = CS.saleLines(t.slice(0, 8) + '01', t, fb);
      const yest = CS.addDays(t, -1); const yL = CS.saleLines(yest, yest, fb);
      const sum = (L, k) => CS.sum(L, k);
      const todayTotal = sum(todayL, 'total'), todayProfit = sum(todayL, 'net') - sum(todayL, 'cost'), yTotal = sum(yL, 'total');
      const monthTotal = sum(monthL, 'total'), monthProfit = sum(monthL, 'net') - sum(monthL, 'cost');
      const receipts = new Set(todayL.map((l) => l.doc.id)).size;
      const recv = CS.db.contacts.reduce((s, c) => { const b = CS.balance(c.id); return s + (b > 0 ? b : 0); }, 0);
      const pay = CS.db.contacts.reduce((s, c) => { const b = CS.balance(c.id); return s + (b < 0 ? -b : 0); }, 0);
      const cash = CS.sum(CS.accountsOf(['kasa']), (a) => CS.accBalance(a.id)); const bank = CS.sum(CS.accountsOf(['banka', 'vadeli', 'doviz', 'pos']), (a) => CS.accBalance(a.id));
      const stockVal = CS.sum(CS.db.products.filter((p) => !p.service && !(p.variants && p.variants.length)), (p) => Math.max(0, CS.stockOf(p)) * CS.num(p.buy));
      const diff = yTotal ? ((todayTotal - yTotal) / yTotal) * 100 : 0;
      const body = CS.head(page, 'Özet', `${CS.can('pos') ? CS.btn('Satış yap', 'pos', 'tag', 'cart') : ''}${CS.can('docs', 'e') ? CS.btn('Fatura kes', 'inv', '', 'file') : ''}${CS.can('contacts', 'e') ? CS.btn('Tahsilat al', 'col', '', 'wallet') : ''}${CS.can('expenses', 'e') ? CS.btn('Gider ekle', 'exp', '', 'trend') : ''}`);
      // 30 gün grafiği
      const days = []; for (let i = 29; i >= 0; i--) { const d = CS.addDays(t, -i); days.push(d); }
      const by = CS.groupBy(CS.saleLines(days[0], t, fb), (l) => l.date);
      const chartData = days.map((d) => ({ label: d.slice(8) + '.' + d.slice(5, 7), value: CS.sum(by[d] || [], 'total'), value2: CS.sum(by[d] || [], 'net') - CS.sum(by[d] || [], 'cost') }));
      // en çok satanlar
      const top = Object.entries(CS.groupBy(monthL, (l) => l.pid)).map(([pid, L]) => ({ pid, qty: CS.sum(L, 'qty'), total: CS.sum(L, 'total') })).sort((a, b) => b.total - a.total).slice(0, 8);
      const maxTop = Math.max(1, ...top.map((x) => x.total));
      const crit = CS.db.products.filter(CS.isCritical).slice(0, 8);
      const soon = CS.addDays(t, 14);
      const dues = [].concat(
        CS.db.cheques.filter((c) => ['portfoy', 'verildi', 'tahsilde'].includes(c.status) && c.due <= soon).map((c) => ({ d: c.due, t: `${c.kind === 'cek' ? 'Çek' : 'Senet'} ${c.dir === 'alinan' ? 'tahsil' : 'ödeme'} — ${CS.contactName(c.cid)}`, a: c.dir === 'alinan' ? c.amount : -c.amount })),
        CS.db.loans.flatMap((l) => (l.inst || []).filter((i) => !i.paid && i.due <= soon).map((i) => ({ d: i.due, t: `Kredi taksiti — ${l.name}`, a: -i.amount }))),
        CS.db.docs.filter((d) => ['satis', 'alis'].includes(d.type) && d.status !== 'iptal' && d.due && d.due <= soon && d.cid && CS.docPaid(d) + 0.01 < d.totalTry).map((d) => ({ d: d.due, t: `${d.no} — ${CS.contactName(d.cid)}`, a: (d.type === 'satis' ? 1 : -1) * (d.totalTry - CS.docPaid(d)) }))
      ).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 10);
      const pend = CS.db.docs.filter((d) => d.type === 'siparis' && ['yeni', 'hazirlaniyor'].includes(d.status));
      body.innerHTML = `
        <div class="kpis">
          ${CS.kpi('Bugünkü satış', money(todayTotal), `${receipts} fiş · dün ${money(yTotal)} ${yTotal ? `(${diff >= 0 ? '+' : ''}${CS.fmt2(diff)}%)` : ''}`, 'hl')}
          ${cc ? CS.kpi('Bugünkü brüt kâr', money(todayProfit), todayTotal ? 'Marj %' + CS.fmt2((todayProfit / Math.max(1, sum(todayL, 'net'))) * 100) : '') : ''}
          ${CS.kpi('Bu ay satış', money(monthTotal), cc ? 'Brüt kâr ' + money(monthProfit) : '')}
          ${CS.kpi('Kasa', money(cash), 'Banka ve POS ' + money(bank))}
          ${CS.kpi('Alacaklar', `<span class="pos">${money(recv)}</span>`, 'Borçlar ' + money(pay))}
          ${cc ? CS.kpi('Stok değeri (maliyet)', money(stockVal), CS.db.products.filter(CS.isCritical).length + ' üründe kritik stok') : ''}
        </div>
        <div class="grid g3" style="grid-template-columns:2fr 1fr">
          <section class="panel"><h2>Son 30 gün satış${cc ? ' ve kâr' : ''}</h2>${CS.barChart(cc ? chartData : chartData.map((d) => ({ label: d.label, value: d.value })), { two: cc, l1: 'Satış', l2: 'Brüt kâr', h: 230 })}</section>
          <section class="panel"><h2>Bu ay en çok satanlar</h2><div class="bars-h">${top.map((x) => `<div><span>${esc(CS.productName(x.pid))}</span><i style="width:${(x.total / maxTop) * 100}%"></i><span>${CS.short(x.total)} ₺</span></div>`).join('') || '<p class="empty">Bu ay satış yok.</p>'}</div></section>
        </div>
        <div class="grid g3" style="margin-top:14px">
          <section class="panel"><h2>Ödeme ve tahsilat takvimi <small>gecikenler ve 14 gün</small></h2><div class="list">${dues.map((x) => `<div><span class="${x.d < t ? 'neg' : ''}">${CS.date(x.d)} · ${esc(x.t)}</span><b class="${x.a >= 0 ? 'pos' : 'neg'}">${money(Math.abs(x.a))}</b></div>`).join('') || '<p class="empty">Yaklaşan vade yok.</p>'}</div></section>
          <section class="panel"><h2>Kritik stok</h2><div class="list">${crit.map((p) => `<div><a href="#products/${p.id}">${esc(CS.productName(p))}</a><span class="neg">${CS.qty(CS.stockOf(p))} / ${CS.qty(p.critical)}</span></div>`).join('') || '<p class="empty">Kritik seviyede ürün yok.</p>'}</div>${crit.length ? '<p><button class="btn sm" data-a="po">Eksikler için satın alma siparişi oluştur</button></p>' : ''}</section>
          <section class="panel"><h2>Bekleyen siparişler ve notlar</h2><div class="list">${pend.map((d) => `<div><a href="#orders/view/${d.id}">${esc(d.no)} · ${esc(CS.contactName(d.cid) || d.buyer || d.channel)}</a><span class="pill info">${esc(CS.ORDER_STATUS?.[d.status] || d.status)}</span></div>`).join('')}${CS.db.notes.filter((n) => !n.done).map((n) => `<div><label class="row"><input type="checkbox" data-note="${n.id}"> ${esc(n.text)}</label><span class="muted">${CS.date(n.date)}</span></div>`).join('')}</div>
            <div class="row" style="margin-top:8px"><input id="nt" placeholder="Not / hatırlatma ekle" style="flex:1"><input id="nd" type="date" value="${t}" style="width:140px"><button class="btn sm" data-a="note">Ekle</button></div></section>
        </div>`;
      CS.bind(page, {
        pos: () => CS.go('pos'), inv: () => CS.go('docs/new/satis'), col: () => CS.quickPayment && CS.quickPayment('in'), exp: () => CS.expenseForm && CS.expenseForm('gider'),
        note: () => { const v = CS.$('#nt', page).value.trim(); if (!v) return; CS.db.notes.push({ id: CS.uid(), text: v, date: CS.$('#nd', page).value, done: false }); CS.save(); CS.route(); CS.refreshBadges(); },
        po: () => { const crit = CS.db.products.filter(CS.isCritical); const lines = crit.map((p) => ({ pid: p.id, name: CS.productName(p), qty: Math.max(1, CS.num(p.critical) * 2 - CS.stockOf(p)), unit: p.unit, price: CS.num(p.buy), kdv: p.kdv, disc: 0 })); CS.docDraft = { type: 'alis_siparis', lines, cid: crit[0]?.supplierId || '' }; CS.go('docs/new/alis_siparis'); }
      });
      page.addEventListener('change', (e) => { const id = e.target.dataset.note; if (id) { CS.byId('notes', id).done = true; CS.save(); CS.refreshBadges(); setTimeout(CS.route, 200); } });
    }
  });
})();
