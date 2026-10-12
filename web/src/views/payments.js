// Ödemeler: iki görünüm, durumlar otomatik hesaplanır.
//   Liste: seçili ayın alınan ödemeleri + son günü gelmiş / gelecek ödemeler.
//   Tablo: eski Excel düzeni. Satır = ders kaydı (derse göre gruplu), sütun = eğitim yılının ayları, altta aylık toplamlar.
import { S, D, save, strip, toast } from "../app.js";
import { esc, TL, fmtH, lower } from "../lib/format.js";
import { fmtDate, monthLabel, monthEnd, daysBetween, addDays, MONTHS } from "../lib/dates.js";
import { isOwner } from "../domain.js";
import { chip, empty, statusOfLevel, modeLabel, unitLabel, avatar } from "../ui.js";

// Seçilen görünüm bu cihazda hatırlanır (tarayıcı izin vermezse liste açılır).
const VIEW_KEY = "kawthar.payView";
try { if (localStorage.getItem(VIEW_KEY) === "tablo") S.payView = "tablo"; } catch {}

const matchQ = st => { const q = lower(S.payQ.trim()); return !q || lower(st?.name).includes(q); };
const byClassName = (a, b) => D.clsName(a).localeCompare(D.clsName(b), "tr");

function monthOptions(sel){
  const set = new Set([D.today().slice(0, 7), sel]);
  Object.values(S.payments).forEach(p => { const k = D.paymentMonth(p); if (k) set.add(k); });
  const [y, m] = D.today().slice(0, 7).split("-").map(Number);   // bir sonraki ay da seçilebilsin
  set.add(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`);
  return [...set].sort().reverse().map(k => `<option value="${k}" ${k === sel ? "selected" : ""}>${monthLabel(k)}</option>`).join("");
}

function filterBar(period, classes){
  const any = S.payQ || S.payStatus || S.payCls;
  return `<div class="filters">
    <input type="search" id="payq" data-input="payQ" placeholder="Öğrenci ara" value="${esc(S.payQ)}" aria-label="Öğrenci ara" autocomplete="off">
    ${period}
    <select id="pcls" data-change="payCls" aria-label="Ders"><option value="">Tüm dersler</option>${classes.map(c => `<option value="${c}" ${S.payCls === c ? "selected" : ""}>${esc(D.clsName(c))}</option>`).join("")}</select>
    ${any ? `<button class="btn ghost" data-act="clearPay">Filtreleri temizle</button>` : ""}
  </div>`;
}

// Özet: tek çubuk (alınan / bekliyor / gecikti) + dokununca o duruma süzen düğmeler + hoca payları satırı.
// Renkler grafiklerle aynı (charts.js SERIES).
const STATES = [["odendi", "Alınan", "var(--s-paid)"], ["bekliyor", "Bekliyor", "var(--s-due)"], ["gecikti", "Gecikti", "var(--s-late)"]];
function summary(v, title){
  const total = v.odendi + v.bekliyor + v.gecikti;
  const pct = total ? Math.round(v.odendi / total * 100) : 0;
  return `<section class="card psum">
    <div class="ps-top"><span class="ps-l">${title}</span><span class="card-n">%${pct} alındı</span></div>
    <b class="ps-v num">${TL(total)}</b>
    <div class="mbar">${STATES.filter(([k]) => v[k] > 0).map(([k, l, c]) => `<i style="flex:${v[k]} 1 0;background:${c}" title="${l}: ${TL(v[k])}"></i>`).join("")}</div>
    <div class="ps-chips">${STATES.map(([k, l, c]) => `<button class="pchip ${S.payStatus === k ? "sel" : ""}" data-act="payFilter" data-s="${k}" aria-pressed="${S.payStatus === k}">
      <i style="background:${c}"></i>${l}<b class="num">${TL(v[k])}</b></button>`).join("")}</div>
    ${v.cut || v.cutAll ? `<p class="ps-cut">Hoca payları: alınanlardan <b class="num">${TL(v.cut)}</b>${v.cutAll != null ? ` · hepsi ödenince <b class="num">${TL(v.cutAll)}</b>` : ""}${v.cut ? ` · ${v.cutOpen ? `<span class="late-t">${TL(v.cutOpen)} hocaya gönderilmedi</span>` : "alınanların payı gönderildi"}` : ""}</p>` : ""}
  </section>`;
}
// Liste grupları: önce gecikenler, sonra bekleyenler, en son ödenenler.
const GROUPS = [["gecikti", "Gecikenler"], ["bekliyor", "Bekleyenler"], ["odendi", "Ödenenler"]];

// ---------- liste ----------
// Seçili ayın satırları — her ekranda aynı kural: kalem AİT OLDUĞU AYA yazılır (D.paymentMonth / D.dueMonth).
// Ödendi: o aya ait ödemeler. Bekliyor/Gecikti: o aya ait ödenmemiş kalemler (kısmi ödemenin kalanı dahil);
// içinde bulunulan ay seçiliyse önceki aylardan kalan gecikmişler de burada görünür.
export function paymentRows(M){
  const end = monthEnd(M), cur = D.today().slice(0, 7);
  const paid = Object.values(S.payments).filter(p => D.paymentMonth(p) === M).map(p => {
    const e = S.enrollments[p.enrollmentId];
    return { status: "odendi", p, e, st: S.students[p.studentId], amount: Number(p.amount) || 0, sort: p.date,
      dueDate: e && p.period ? D.periodDue(e, p.period) : null, label: p.label, mode: p.mode };
  });
  const open = [];
  for (const e of D.activeEnrollments()) for (const d of D.dues(e, addDays(end, 70))){
    const k = D.dueMonth(d);
    if (k !== M && !(M === cur && k < M)) continue;
    open.push({ status: statusOfLevel(d.level), e, st: S.students[e.studentId], d, amount: d.amount, sort: d.dueDate, dueDate: d.dueDate, label: d.periodLabel, mode: d.mode });
  }
  const rank = { gecikti: 0, bekliyor: 1, odendi: 2 };
  return [...open, ...paid].sort((a, b) => rank[a.status] - rank[b.status] || (a.status === "odendi" ? b.sort.localeCompare(a.sort) : a.sort.localeCompare(b.sort)));
}

// Kevser Hanım'ın bir aydaki net kazancı: şu ana kadar (alınan − o ödemelerin hoca payı) ve
// hepsi tamamlanınca (ayın tüm ödemeleri − tüm hoca payları; ödenmemiş kalemin payı ödendiğinde oluşacak paydır).
// Kalemler Liste görünümüyle aynı: paymentRows(M).
export function monthNet(M){
  let got = 0, gotCut = 0, all = 0, allCut = 0;
  for (const x of paymentRows(M)){
    const cut = x.status === "odendi" ? Number(x.p.teacherCut) || 0 : D.teacherCut(x.e, x.amount);
    all += x.amount; allCut += cut;
    if (x.status === "odendi"){ got += x.amount; gotCut += cut; }
  }
  return { got, gotCut, netNow: got - gotCut, all, allCut, netAll: all - allCut };
}
// Bir ayda her hocaya gidecek pay, üç durumda: gönderildi (sent), veliden alındı ama hocaya gönderilmedi (toSend),
// veliden henüz alınmadı (waiting; ödendiğinde oluşacak pay). older: önceki aylardan alınmış ama gönderilmemiş paylar.
export function teacherShares(M){
  const out = {};
  const get = t => out[t] ||= { sent: 0, toSend: 0, waiting: 0, waitingNames: [], older: 0, total: 0 };
  for (const x of paymentRows(M)){
    const t = x.status === "odendi" ? x.p.teacher : x.e?.teacher;
    if (!t) continue;
    if (x.status === "odendi"){ const c = Number(x.p.teacherCut) || 0; if (c) get(t)[x.p.teacherPaid ? "sent" : "toSend"] += c; }
    else { const c = D.teacherCut(x.e, x.amount); if (c){ get(t).waiting += c; get(t).waitingNames.push(x.st.name); } }
  }
  for (const p of Object.values(S.payments))
    if (p.teacher && Number(p.teacherCut) > 0 && !p.teacherPaid && D.paymentMonth(p) < M) get(p.teacher).older += Number(p.teacherCut);
  for (const v of Object.values(out)) v.total = v.sent + v.toSend + v.waiting;
  return out;
}
function netCard(M){
  const n = monthNet(M);
  if (!n.all) return "";
  const pct = n.netAll > 0 ? Math.max(0, Math.min(100, Math.round(n.netNow / n.netAll * 100))) : 0;
  return `<section class="card netcard">
    <div class="ps-top"><span class="ps-l">${monthLabel(M)} · Kevser Hanım'ın net kazancı</span><span class="card-n">%${pct}</span></div>
    <div class="nc-grid">
      <div><small>Şu ana kadar</small><b class="num">${TL(n.netNow)}</b><span class="num">alınan ${TL(n.got)} − hoca payı ${TL(n.gotCut)}</span></div>
      <div class="nc-all"><small>Hepsi ödenince</small><b class="num">${TL(n.netAll)}</b><span class="num">beklenen ${TL(n.all)} − hoca payları ${TL(n.allCut)}</span></div>
    </div>
    <div class="db-bar tc-bar"><i style="width:${pct}%"></i></div>
  </section>`;
}

// Satır: rozet · ad + tek satır bilgi · tutar + işlem. Durum, satırın bulunduğu gruptan anlaşılır.
function rowHTML(x){
  const name = x.st ? esc(x.st.name) : "Silinmiş öğrenci";
  const cls = x.e ? esc(D.clsName(x.e.classId)) : "";
  if (x.status === "odendi"){
    const p = x.p;
    return `<div class="prow">${avatar(x.st?.name, x.e?.classId)}
      <div class="pmain"><button class="link name" data-act="profile" data-id="${p.studentId}">${name}</button>
        <span class="sub">${cls} · ${esc(x.label || "")} · ödeme ${fmtDate(p.date)}${p.note ? ` · ${esc(p.note)}` : ""}</span>
        ${p.teacherCut ? `<span class="sub tcut">${esc(p.teacher)} payı <b class="num">${TL(p.teacherCut)}</b>
          <button class="btn xs ${p.teacherPaid ? "on" : ""}" data-act="tpaid" data-id="${p.id}" aria-pressed="${!!p.teacherPaid}">${p.teacherPaid ? `✓ Gönderildi${p.teacherPaidDate ? ` (${fmtDate(p.teacherPaidDate)})` : ""}` : "Gönderilmedi"}</button></span>` : ""}
      </div>
      <div class="pside"><span class="amt num">${TL(p.amount)}</span></div></div>`;
  }
  const late = x.status === "gecikti" ? daysBetween(x.dueDate, D.today()) : 0;
  return `<div class="prow">${avatar(x.st.name, x.e.classId)}
    <div class="pmain"><button class="link name" data-act="profile" data-id="${x.st.id}">${name}</button>
      <span class="sub">${cls} · ${esc(x.label)}${x.d.paid ? ` · kalan (${TL(x.d.paid)} alındı)` : ""}</span>
      <span class="sub ${late ? "late-t" : ""}">${late ? `${late} gün gecikti` : `Son gün ${fmtDate(x.dueDate)}`}</span></div>
    <div class="pside"><span class="amt num">${TL(x.amount)}</span>
      <button class="tbtn" data-act="pay" data-id="${x.st.id}" data-e="${x.e.id}" data-p="${x.d.period || ""}">Al</button></div></div>`;
}

function listView(){
  const base = paymentRows(S.month);
  const all = base.filter(x => matchQ(x.st) && (!S.payCls || x.e?.classId === S.payCls));
  const rows = all.filter(x => !S.payStatus || x.status === S.payStatus);
  const sum = st => all.filter(x => x.status === st).reduce((a, x) => a + x.amount, 0);
  const paidRows = all.filter(x => x.status === "odendi");
  const classes = [...new Set(base.map(x => x.e?.classId).filter(Boolean))].sort(byClassName);
  const groups = GROUPS.map(([k, l]) => { const g = rows.filter(x => x.status === k); return g.length ? `<section class="pgroup ${k}">
      <h3 class="pg-h">${l} <span class="num">${g.length}</span></h3>
      <div class="panel"><div class="plist">${g.map(rowHTML).join("")}</div></div></section>` : ""; }).join("");
  return `${filterBar(`<select id="pmonth" data-change="payMonth" aria-label="Ay">${monthOptions(S.month)}</select>`, classes)}
    ${summary({ odendi: sum("odendi"), bekliyor: sum("bekliyor"), gecikti: sum("gecikti"),
      cut: paidRows.reduce((a, x) => a + (Number(x.p.teacherCut) || 0), 0),
      cutOpen: paidRows.filter(x => !x.p.teacherPaid).reduce((a, x) => a + (Number(x.p.teacherCut) || 0), 0),
      // monthNet ve Hocalar ile aynı hesap: ödenmemiş kalemin payı, ödendiğinde oluşacak paydır
      cutAll: all.reduce((a, x) => a + (x.status === "odendi" ? Number(x.p.teacherCut) || 0 : D.teacherCut(x.e, x.amount)), 0) }, `${monthLabel(S.month)} toplamı`)}
    ${netCard(S.month)}
    ${rows.length ? groups : `<div class="panel">${empty(base.length ? "Bu filtreyle kayıt yok." : `${monthLabel(S.month)} için ödeme ya da bekleyen ödeme yok.`)}</div>`}`;
}

// ---------- tablo ----------
const SHORT = MONTHS.map(m => m.slice(0, 3));
const num = n => Math.round(Number(n) || 0).toLocaleString("tr-TR");
const shortDate = d => { const [, m, day] = d.split("-").map(Number); return `${day} ${SHORT[m - 1]}`; };
const total = (list, f) => list.reduce((a, x) => a + (Number(f(x)) || 0), 0);
// Eski kayıtlara taşıma sırasında yazılan not, hücrede not işareti göstermez.
const realNote = p => p.note && !/^Devirden aktarıldı/.test(p.note);

function seasonList(cur){
  let min = cur;
  for (const p of Object.values(S.payments)) if (p.date) min = Math.min(min, D.seasonOf(p.date));
  for (const e of Object.values(S.enrollments)) if (e.startDate) min = Math.min(min, D.seasonOf(e.startDate));
  return Array.from({ length: cur - min + 1 }, (_, i) => cur - i);
}

function tableData(){
  const t = D.today(), nowKey = t.slice(0, 7), cur = D.seasonOf(t);
  const season = S.paySeason ?? cur;
  const months = D.seasonMonths(season), seasonEnd = monthEnd(months[11]);
  let rows = Object.values(S.enrollments).map(e => ({ e, st: S.students[e.studentId], cells: D.monthCells(e, months) }))
    .filter(r => r.st && ((D.isActiveEnr(r.e) && (r.e.startDate || "") <= seasonEnd) || r.cells.some(c => c.pays.length)));
  // Eylül–Mayıs her zaman; yaz ayları o ay gelince ya da o ay ödeme varsa görünür.
  const show = months.map((k, i) => i < 9 || k <= nowKey || rows.some(r => r.cells[i].pays.length));
  rows.forEach(r => { r.cells = r.cells.filter((_, i) => show[i]); });
  const classes = [...new Set(rows.map(r => r.e.classId))].sort(byClassName);
  rows = rows.filter(r => matchQ(r.st) && (!S.payCls || r.e.classId === S.payCls));
  const kindIdx = cid => { const i = D.kinds().findIndex(k => k.key === S.classes[cid]?.kind); return i < 0 ? 99 : i; };
  rows.sort((a, b) => kindIdx(a.e.classId) - kindIdx(b.e.classId) || byClassName(a.e.classId, b.e.classId) || a.st.name.localeCompare(b.st.name, "tr"));
  return { season, seasons: seasonList(cur), keys: months.filter((_, i) => show[i]), rows, classes, nowKey };
}

function cellHTML(r, c){
  if (c.status === "yok") return `<td class="pc"></td>`;
  const { e, st } = r, lbl = monthLabel(c.key), weekly = c.weeks > 0;
  const paidTxt = c.pays.map(p => `${fmtDate(p.date)} ${TL(p.amount)}${p.note ? ` (${p.note})` : ""}`).join(", ");
  let cls, main, sub = "", tip;
  if (c.status === "odendi"){
    cls = "paid"; main = num(c.paid);
    sub = weekly ? `${c.weeksPaid}/${c.weeks} hafta` : c.hours ? `${fmtH(c.hours)} saat` : c.pays.length > 1 ? `${c.pays.length} ödeme` : shortDate(c.pays[0].date);
    tip = `${lbl}: ödendi · ${paidTxt}`;
  } else if (c.status === "gelecek"){
    cls = "fut"; main = num(c.expected);
    tip = `${lbl}: ${TL(c.expected)} alınacak · son gün ${fmtDate(c.next.dueDate)}`;
  } else {
    const late = c.status === "gecikti";
    cls = late ? "late" : "due"; main = num(c.due);
    // Kısmi ödenmiş ay: hücrede kalan tutar yazar.
    sub = late ? (weekly ? `${c.lateCount} hafta gecikti` : c.partial ? "kalan · gecikti" : "gecikti")
      : `${c.partial ? "kalan · " : ""}son ${shortDate(c.open[0].dueDate)}`;
    const parts = [c.lateAmount && `${TL(c.lateAmount)} gecikti`, c.due > c.lateAmount && `${TL(c.due - c.lateAmount)} bekliyor`].filter(Boolean);
    tip = `${lbl}: ${parts.join(", ")} · son gün ${fmtDate(c.open[0].dueDate)}${c.pays.length ? ` · ödenen: ${paidTxt}` : ""}`;
  }
  const act = c.status === "odendi" ? `data-act="profile" data-id="${st.id}"`
    : `data-act="pay" data-id="${st.id}" data-e="${e.id}" data-p="${c.next?.period || ""}"`;
  return `<td class="pc"><button class="pcell ${cls} ${c.pays.some(realNote) ? "note" : ""}" ${act} title="${esc(tip)}" aria-label="${esc(`${st.name} · ${tip}`)}">
    <b class="num">${main}</b>${sub ? `<small>${sub}</small>` : ""}</button></td>`;
}

function tableRowHTML(r){
  const { e, st, cells } = r, off = !D.isActiveEnr(e);
  const meta = [!isOwner(e.teacher) && e.teacher, (e.pay?.mode || "aylik") !== "aylik" && modeLabel(e).replace(/ \(.*\)$/, ""), off && "bıraktı"].filter(Boolean).join(" · ");
  const paid = total(cells, c => c.paid);
  return `<tr class="${off ? "off" : ""}">
    <th scope="row" class="sn"><button class="link" data-act="profile" data-id="${st.id}">${esc(st.name)}</button>${meta ? `<small>${esc(meta)}</small>` : ""}</th>
    <td class="rt hide-n num">${num(e.rate)}<small> / ${unitLabel(e)}</small></td>
    <td class="rt hide-n num">${!isOwner(e.teacher) && Number(e.teacherShare) ? num(e.teacherShare) : "–"}</td>
    ${cells.map(c => cellHTML(r, c)).join("")}
    <td class="rt tot num">${paid ? num(paid) : "–"}</td></tr>`;
}

function tableView(){
  const { season, seasons, keys, rows, classes, nowKey } = tableData();
  const shown = rows.filter(r => !S.payStatus || r.cells.some(c => c.status === S.payStatus));
  const cells = rows.flatMap(r => r.cells), pays = cells.flatMap(c => c.pays);
  const v = { odendi: total(cells, c => c.paid), bekliyor: total(cells, c => c.due - c.lateAmount), gecikti: total(cells, c => c.lateAmount),
    cut: total(pays, p => p.teacherCut), cutOpen: total(pays.filter(p => !p.teacherPaid), p => p.teacherCut) };
  const seasonSel = seasons.length > 1 ? `<select id="pseason" data-change="paySeason" aria-label="Eğitim yılı">${seasons.map(y =>
    `<option value="${y}" ${y === season ? "selected" : ""}>${y}–${y + 1} eğitim yılı</option>`).join("")}</select>` : "";

  // Altta her ayın toplamı (görünen satırlar üzerinden).
  const col = f => keys.map((_, i) => total(shown, r => f(r.cells[i])));
  const paid = col(c => c.paid), due = col(c => c.due), cut = col(c => c.cut), net = paid.map((x, i) => x - cut[i]);
  const footRow = (label, vals, cls = "") => `<tr class="${cls}"><th scope="row" class="sn">${label}</th><td class="hide-n" colspan="2"></td>
    ${vals.map(x => `<td class="rt num ${x ? "" : "z"}">${x ? num(x) : "–"}</td>`).join("")}<td class="rt tot num">${num(vals.reduce((a, x) => a + x, 0))}</td></tr>`;

  let body = "", last = null;
  for (const r of shown){
    if (r.e.classId !== last){ last = r.e.classId; body += `<tr class="grp"><th scope="rowgroup" class="sn">${chip(last)}</th><td colspan="${keys.length + 3}"></td></tr>`; }
    body += tableRowHTML(r);
  }
  const legend = [["paid", "Ödendi"], ["due", "Bekliyor"], ["late", "Gecikti"]]
    .map(([c, l]) => `<span class="lg"><i class="sw ${c}"></i>${l}</span>`).join("") + `<span class="lg lg-note">Boş: zamanı gelmedi</span>`;

  return `${filterBar(seasonSel, classes)}
    ${summary(v, season === D.seasonOf(D.today())
      ? `Eylül – ${MONTHS[Number(D.today().slice(5, 7)) - 1]} toplamı (bugüne kadar; ileriki aylar dahil değil)`
      : `${season}–${season + 1} eğitim yılı toplamı`)}
    <div class="ptab-head"><h3>${season}–${season + 1} eğitim yılı · tutarlar TL</h3><div class="legend-row">${legend}</div></div>
    ${shown.length ? `<div class="ptab-wrap"><table class="ptab">
      <thead><tr><th scope="col" class="sn">Öğrenci</th><th scope="col" class="rt hide-n">Ücret</th><th scope="col" class="rt hide-n">Hoca payı</th>
        ${keys.map(k => `<th scope="col" class="rt ${k === nowKey ? "cur" : ""}">${MONTHS[Number(k.slice(5)) - 1]}</th>`).join("")}<th scope="col" class="rt">Toplam</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot>${footRow("Alınan", paid)}${footRow("Ödenmedi", due, "due")}${footRow("Hoca payları", cut)}${footRow("Net kazanç", net, "net")}</tfoot>
    </table></div>
    <p class="hint" style="margin:0">Her ödeme ait olduğu aya yazılır: aylıkta o ay, haftalıkta haftanın ödeme günü, pakette ödeme tarihi. Ödenmemiş hücreye dokununca ödeme alınır, ödenmiş hücreye dokununca öğrenci açılır. Köşesi işaretli hücrede ödeme notu var (üzerine gelince görünür).</p>`
    : `<div class="panel">${empty(rows.length ? "Bu filtreyle kayıt yok." : "Bu eğitim yılı için ders kaydı yok.")}</div>`}`;
}

// ---------- sayfa ----------
export function vPayments(){
  const sw = [["liste", "Liste"], ["tablo", "Tablo"]].map(([v, l]) =>
    `<button data-act="payView" data-v="${v}" aria-pressed="${S.payView === v}">${l}</button>`).join("");
  return `<div class="stack">
    <div class="sec-head"><h2>Ödemeler</h2><div class="toolbar"><div class="vswitch" role="group" aria-label="Görünüm">${sw}</div>
      <button class="btn pri" data-act="payPick">+ Ödeme al</button></div></div>
    ${S.payView === "tablo" ? tableView() : listView()}
  </div>`;
}

export async function toggleTeacherPaid(id){
  const p = S.payments[id]; if (!p) return;
  const next = !p.teacherPaid;
  if (await save("payments", id, { ...strip(p), teacherPaid: next, teacherPaidDate: next ? D.today() : null }))
    toast(next ? `${p.teacher} payı ödendi olarak işaretlendi.` : "Hoca payı ödenmedi olarak işaretlendi.");
}

export const views = { odemeler: vPayments };
export const actions = {
  tpaid: t => toggleTeacherPaid(t.dataset.id),
  payFilter(t){ S.payStatus = S.payStatus === t.dataset.s ? "" : t.dataset.s; },
  payView(t){ S.payView = t.dataset.v; try { localStorage.setItem(VIEW_KEY, S.payView); } catch {} },
  clearPay(){ Object.assign(S, { payQ: "", payStatus: "", payCls: "" }); },
};
export const inputs = { payQ(el){ S.payQ = el.value; return true; } };
export const changes = {
  payMonth(el){ S.month = el.value; return true; },
  paySeason(el){ S.paySeason = Number(el.value); return true; },
  payStatus(el){ S.payStatus = el.value; return true; },
  payCls(el){ S.payCls = el.value; return true; },
};
