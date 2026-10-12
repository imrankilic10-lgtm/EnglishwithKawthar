// Bugün: uygulama veri yığmaz, ne yapılacağını söyler.
//   Selam + tarih → "Sıradaki ders" kartı (günün cetveli: bugünün dersleri saat şeridinde, şu an çizgisi)
//   → "Bugün yapılacaklar" (hatırlatma gönder, ödeme al, hocaya gönder; iş bitince listeden kendiliğinden düşer)
//   → ay özeti (tek çubuk) → bugünün dersleri, yaklaşan dersler, ay ay tahsilat.
// Renk kuralı: renk yalnızca anlam taşır (mor: sıradaki iş, kırmızı: gecikmiş, turuncu: bekliyor).
import { S, D, clock } from "../app.js";
import { OWNER } from "../domain.js";
import { esc, TL } from "../lib/format.js";
import { addDays, parse, wd, toMin, daysBetween, DAYS, DAYS_S, MONTHS, pad } from "../lib/dates.js";
import { stackedBars, SERIES } from "../charts.js";
import { avatar, ticket, teacherText } from "../ui.js";
import { paymentRows, monthNet } from "./payments.js";
import { lateByStudent, unpaidCuts } from "../sheets/quick.js";

const TASK_LIMIT = 5, NEXT_LIMIT = 5;
const lessonData = l => `data-c="${l.classId}" data-date="${l.date}" data-s="${l.start}" data-x="${l.extraId || ""}"`;
const names = l => D.participants(l).map(p => p.st.name).join(", ") || "Öğrenci yok";
// Dil okulu: selam İngilizce, el yazısıyla.
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const shiftMonth = (key, n) => { let [y, m] = key.split("-").map(Number); m += n; while (m > 12){ m -= 12; y++; } while (m < 1){ m += 12; y--; } return `${y}-${pad(m)}`; };
const card = (cls, title, aside, body) =>
  `<section class="card ${cls}"><header class="card-h"><h3>${title}</h3>${aside || ""}</header>${body}</section>`;
const count = n => `<span class="card-n">${n}</span>`;
const inMin = m => m < 60 ? `${m} dk sonra` : `${Math.floor(m / 60)} saat${m % 60 ? ` ${m % 60} dk` : ""} sonra`;
const dayWord = d => { const n = daysBetween(D.today(), d); return n === 1 ? "Yarın" : DAYS[wd(d)]; };

function lessonState(l){
  if (l.cancelled) return `<span class="st late">İptal</span>`;
  const n = Object.keys(l.absent).length;
  const tag = l.type !== "normal" ? `${l.type === "telafi" ? "Telafi" : "Ekstra"} · ` : "";
  if (n) return `<span class="st today">${tag}${n} gelmedi</span>`;
  if (D.isDone(l)) return `<span class="st">${tag}Bitti</span>`;
  if (l.date === D.today() && toMin(l.start) <= clock.nowMin()) return `<span class="st ok">${tag}Şu an</span>`;
  return tag ? `<span class="st">${tag.slice(0, -3)}</span>` : "";
}
const dueWhen = d => { const n = daysBetween(D.today(), d.dueDate); return n < 0 ? `${-n} gün gecikti` : n === 0 ? "bugün" : n === 1 ? "yarın" : `${n} gün sonra`; };

// ---------- sıradaki ders + günün cetveli ----------
function heroLesson(){
  const t = D.today(), now = clock.nowMin();
  const todays = D.lessonsOn(t).filter(l => !l.cancelled);
  const cur = todays.find(l => toMin(l.start) <= now && toMin(l.end) > now);
  if (cur) return { l: cur, label: "Şu an derste", when: `${toMin(cur.end) - now} dk kaldı` };
  const nxt = todays.find(l => toMin(l.start) > now);
  if (nxt) return { l: nxt, label: "Sıradaki ders", when: inMin(toMin(nxt.start) - now) };
  const up = D.lessonsBetween(addDays(t, 1), addDays(t, 7)).find(l => !l.cancelled);
  if (up) return { l: up, label: todays.length ? "Bugünün dersleri bitti · sıradaki" : "Sıradaki ders", when: `${dayWord(up.date)} ${up.start}` };
  return null;
}
// Okul cetveli gibi saat şeridi: bugünün dersleri blok blok, şu an çizgisi.
function ruler(lessons, focus){
  if (!lessons.length) return "";
  let a = 9, b = 21;
  lessons.forEach(l => { a = Math.min(a, Math.floor(toMin(l.start) / 60)); b = Math.max(b, Math.ceil(toMin(l.end) / 60)); });
  const span = (b - a) * 60, pos = m => ((m - a * 60) / span * 100).toFixed(2);
  const now = clock.nowMin();
  const ticks = Array.from({ length: b - a + 1 }, (_, i) => `<i class="tk ${(a + i) % 3 === 0 ? "big" : ""}" style="left:${pos((a + i) * 60)}%">${(a + i) % 3 === 0 ? `<em>${pad(a + i)}</em>` : ""}</i>`).join("");
  const blocks = lessons.map(l => `<span class="rb ${l === focus || (focus && l.key === focus.key) ? "on" : ""} ${l.cancelled ? "off" : ""}"
    style="left:${pos(toMin(l.start))}%;width:${((toMin(l.end) - toMin(l.start)) / span * 100).toFixed(2)}%"
    title="${l.start}–${l.end} · ${esc(D.clsName(l.classId))}${l.cancelled ? " (iptal)" : ""}"></span>`).join("");
  const nowLine = now >= a * 60 && now <= b * 60 ? `<i class="now" style="left:${pos(now)}%"><em>şimdi</em></i>` : "";
  return `<div class="ruler" aria-label="Bugünün dersleri saat şeridinde: ${lessons.map(l => `${l.start} ${esc(D.clsName(l.classId))}`).join(", ")}">${blocks}${ticks}${nowLine}</div>`;
}
function heroCard(L){
  const h = heroLesson();
  if (!h) return `<section class="hero"><p class="hero-l">Sıradaki ders</p><p class="hero-t">Önümüzdeki günlerde ders yok</p>
    <div class="hero-a"><button class="chipbtn" data-tab="program">Ders programını aç</button></div></section>`;
  const { l } = h, ppl = D.participants(l);
  const tch = [...new Set(ppl.map(p => p.e ? teacherText(p.e) : OWNER))].join(", ");
  return `<section class="hero">
    <div class="hero-top"><span class="hero-l">${h.label}</span><span class="hero-w">${h.when}</span></div>
    <p class="hero-t"><span class="num">${l.start}</span> · ${esc(D.clsName(l.classId))}</p>
    <p class="hero-s">${esc(ppl.map(p => p.st.name).join(", ") || "Öğrenci yok")} · ${esc(tch)}</p>
    ${l.date === D.today() ? ruler(L, l) : ""}
    <div class="hero-a"><button class="chipbtn" data-act="lesson" ${lessonData(l)}>Gelmeyen var / iptal</button>
      <button class="chipbtn ghost" data-tab="program">Program</button></div>
  </section>`;
}

// ---------- bugün yapılacaklar ----------
// Veriden hesaplanır; iş yapıldıkça (ödeme alındı, pay gönderildi) kendiliğinden listeden düşer.
function tasks(){
  const out = [];
  const late = lateByStudent();
  if (late.length){
    const ns = late.map(g => g.st.name);
    out.push({ tone: "red", icon: "i-msg", title: `${late.length} veliye hatırlatma gönder`,
      sub: `${ns.slice(0, 3).join(", ")}${ns.length > 3 ? ` ve ${ns.length - 3} kişi daha` : ""} · ${TL(late.reduce((a, g) => a + g.items.reduce((b, x) => b + x.d.amount, 0), 0))}`,
      btn: "Hazırla", act: `data-act="remind"` });
  }
  const soon = D.pendingDues(3).filter(x => x.d.level !== "late");
  soon.slice(0, 2).forEach(({ e, st, d }) => out.push({ tone: "amber", icon: "i-wallet", av: avatar(st.name, e.classId, "sm"),
    title: `Ödeme al · ${st.name}`, sub: `${TL(d.amount)} · ${d.periodLabel}${d.paid ? " kalan" : ""} · ${dueWhen(d)}`,
    btn: "Al", act: `data-act="pay" data-id="${st.id}" data-e="${e.id}" data-p="${d.period || ""}"` }));
  if (soon.length > 2) out.push({ tone: "amber", icon: "i-wallet", title: `${soon.length - 2} ödeme daha bu hafta bekleniyor`, sub: "Ödemeler sayfasında hepsi", btn: "Gör", act: `data-act="goPayments"` });
  // Ödenmemiş defter / ürün satışları
  const unpaidSales = D.salesOf().filter(s => !s.paid && S.products[s.productId]);
  if (unpaidSales.length){
    const who = [...new Set(unpaidSales.map(s => S.students[s.studentId]?.name).filter(Boolean))];
    out.push({ tone: "amber", icon: "i-book", title: `Defter ücreti · ${who.length} kişi`,
      sub: `${who.slice(0, 3).join(", ")}${who.length > 3 ? ` ve ${who.length - 3} kişi daha` : ""} · ${TL(unpaidSales.reduce((a, s) => a + D.saleTotal(s), 0))}`,
      btn: "Gör", act: `data-act="goNotebooks"` });
  }
  const tnames = [...new Set(Object.values(S.payments).filter(p => p.teacher && Number(p.teacherCut) > 0 && !p.teacherPaid).map(p => p.teacher))].sort((a, b) => a.localeCompare(b, "tr"));
  tnames.forEach(n => { const ps = unpaidCuts(n);
    out.push({ tone: "sky", icon: "i-send", title: `Pay gönder · ${n}`, sub: `${TL(ps.reduce((a, p) => a + Number(p.teacherCut), 0))} · ${ps.length} ödemeden`,
      btn: "Gönderdim", ghost: true, act: `data-act="tpay" data-t="${esc(n)}"` }); });
  return out;
}
function taskCard(){
  const list = tasks();
  const body = list.length ? `<div class="tasks">${list.slice(0, TASK_LIMIT).map(x => `<div class="task">
      ${x.av || `<span class="t-ico ${x.tone}" aria-hidden="true"><svg class="ico"><use href="#${x.icon}"/></svg></span>`}
      <span class="bd"><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></span>
      <button class="tbtn ${x.ghost ? "ghost" : ""}" ${x.act}>${x.btn}</button></div>`).join("")}</div>
    ${list.length > TASK_LIMIT ? `<button class="more" data-act="goPayments">+${list.length - TASK_LIMIT} iş daha →</button>` : ""}`
    : `<div class="alldone"><span class="t-ico lime" aria-hidden="true"><svg class="ico"><use href="#i-check"/></svg></span><span><b>Bugünlük her şey tamam.</b><small>Geciken ödeme ya da bekleyen iş yok.</small></span></div>`;
  return card("b-tasks", "Bugün yapılacaklar", list.length ? count(list.length) : "", body);
}

// ---------- ay özeti: tek çubuk ----------
function monthCard(m, v){
  const total = v.alinan + v.bekliyor + v.gecikti;
  const pct = k => total ? v[k] / total * 100 : 0;
  const got = total ? Math.round(pct("alinan")) : 0;
  const seg = SERIES.filter(s => v[s.key] > 0).map(s => `<i style="flex:${v[s.key]} 1 0;background:${s.color}" title="${s.label}: ${TL(v[s.key])}"></i>`).join("");
  const [y, mm] = m.split("-").map(Number);
  return card("b-month", `${MONTHS[mm - 1]} ${y}`, `<span class="card-n">%${got} alındı</span>`, total ? `
    <div class="mbar" role="img" aria-label="${SERIES.map(s => `${s.label} ${TL(v[s.key])}`).join(", ")}">${seg}</div>
    <div class="mleg">${SERIES.map(s => `<span><i style="background:${s.color}"></i>${s.label}<b class="num">${TL(v[s.key])}</b></span>`).join("")}</div>
    ${(n => `<div class="mnet"><span>Kevser Hanım'a kalan (net)</span><b class="num">${TL(n.netNow)}</b><small>Hepsi ödenince <b class="num">${TL(n.netAll)}</b></small></div>`)(monthNet(m))}
    <button class="more" data-act="goPayments">Ödemeler →</button>`
    : `<p class="empty">Bu ay için ödeme ya da bekleyen ödeme yok.</p>`);
}

export function vDashboard(){
  const t = D.today(), d = parse(t), m = t.slice(0, 7);
  if (!D.activeStudents().length && !Object.keys(S.classes).length) return `<div class="home">
    <section class="hello"><div><p class="h-hand">Welcome, ${OWNER}</p><h2 class="h-date">Başlayalım</h2>
      <p class="h-say">Henüz öğrenci eklenmedi. Önce “Ders Programı”ndan gruplarını, sonra “Öğrenciler”den öğrencilerini ekle.</p></div></section></div>`;

  const L = D.lessonsOn(t), held = L.filter(l => !l.cancelled), cancelled = L.length - held.length;
  const next = D.lessonsBetween(addDays(t, 1), addDays(t, 3)).filter(l => !l.cancelled).slice(0, NEXT_LIMIT);
  const rows = paymentRows(m);
  const sum = st => rows.filter(x => x.status === st).reduce((a, x) => a + x.amount, 0);
  const statusNow = { alinan: sum("odendi"), bekliyor: sum("bekliyor"), gecikti: sum("gecikti") };
  const months = [-2, -1, 0, 1, 2].map(n => shiftMonth(m, n)).map(key => {
    const s = D.monthSummary(key); const [y, mm] = key.split("-").map(Number);
    return { label: MONTHS[mm - 1].slice(0, 3), full: `${MONTHS[mm - 1]} ${y}`, current: key === m,
      values: { alinan: s.alinan, bekliyor: s.bekliyor, gecikti: s.gecikti } };
  });
  const say = [held.length ? `Bugün ${held.length} ders var` : "Bugün ders yok", cancelled ? `${cancelled} iptal` : ""].filter(Boolean).join(" · ");

  const lessonsBody = L.length ? `<div class="hlist">${L.map(l => `<button class="hrow ${l.cancelled ? "dim" : ""}" data-act="lesson" ${lessonData(l)}>
      ${ticket(l.classId, l.start, l.end)}
      <span class="bd"><b>${esc(D.clsName(l.classId))}</b><small>${esc(names(l))}</small></span>${lessonState(l)}</button>`).join("")}</div>`
    : `<p class="empty">Bugün ders yok.</p>`;
  const nextBody = next.length ? `<div class="hlist">${next.map(l => `<button class="hrow" data-act="lesson" ${lessonData(l)}>
      ${ticket(l.classId, DAYS_S[wd(l.date)], l.start)}
      <span class="bd"><b>${esc(D.clsName(l.classId))}</b><small>${esc(names(l))}</small></span>${l.type !== "normal" ? `<span class="st">${l.type === "telafi" ? "Telafi" : "Ekstra"}</span>` : ""}</button>`).join("")}</div>`
    : `<p class="empty">Önümüzdeki 3 günde ders yok.</p>`;

  return `<div class="home">
    <section class="hello">
      <div>
        <p class="h-hand">${greeting()}, ${OWNER}</p>
        <h2 class="h-date">${DAYS[wd(t)]}, <em>${d.getDate()} ${MONTHS[d.getMonth()]}</em></h2>
        <p class="h-say">${say}.</p>
      </div>
      <div class="h-acts wide-only"><button class="btn pri" data-act="payPick"><svg class="ico"><use href="#i-plus"/></svg>Ödeme al</button>
        <button class="btn" data-act="quick">Yeni ekle</button></div>
    </section>

    <!-- İki bağımsız sütun; telefonda tek sütun ve sıra: ders, yapılacaklar, ay, bugünün dersleri, yaklaşan, grafik. -->
    <div class="bento">
      <div class="b-col b-main">
        ${heroCard(L)}
        ${L.length ? card("b-lessons", "Bugünün dersleri", count(L.length), lessonsBody) : ""}
        ${card("b-bars", "Ay ay tahsilat", `<span class="hint">son 2 ay · bu ay · gelecek 2 ay</span>`, stackedBars(months, { title: "Aylık tahsilat" }))}
      </div>
      <div class="b-col b-side">
        ${taskCard()}
        ${monthCard(m, statusNow)}
        ${card("b-up", "Yaklaşan dersler", `<span class="hint">3 gün</span>`, nextBody)}
      </div>
    </div>
  </div>`;
}

export const views = { ozet: vDashboard };
export const actions = {
  goPayments(){
    S.tab = "odemeler"; S.month = D.today().slice(0, 7); S.payStatus = ""; S.payCls = "";
    try { localStorage.setItem("kw_tab", S.tab); } catch(_) {}
    window.scrollTo(0, 0);
  },
  goLate(){ actions.goPayments(); S.payStatus = "gecikti"; },
};
