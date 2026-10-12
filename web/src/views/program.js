// Ders programı: seçili haftanın dersleri. Haftalık dersler programdan otomatik gelir; iptal, gelmeyen ve telafi/ekstra dersler üstüne işlenir.
// Geniş ekranda saat ızgarası, telefonda gün gün liste (yatay kaydırma yok).
import { S, D, openSheet, toast } from "../app.js";
import { esc } from "../lib/format.js";
import { addDays, mondayOf, wd, toMin, pad, fmtDate, DAYS } from "../lib/dates.js";
import { chip, empty, typeTag, ticket } from "../ui.js";

const HPX = 56;
// claude.ai paylaşım sürümünde sayfa kendi başına dosya indiremez; PDF düğmesi gizlenir.
const SHARE = import.meta.env.VITE_SHARE === "1";
const lessonData = l => `data-c="${l.classId}" data-date="${l.date}" data-s="${l.start}" data-x="${l.extraId || ""}"`;
const absentCount = l => Object.keys(l.absent).length;
const flags = l => `${typeTag(l)}${l.cancelled ? `<span class="pill late">İptal</span>` : absentCount(l) ? `<span class="pill today">${absentCount(l)} gelmedi</span>` : ""}`;

function grid(dates, lessons, gs, ge){
  const cols = `52px repeat(${dates.length}, minmax(0,1fr))`; const t = D.today();
  let h = `<div class="pg" style="grid-template-columns:${cols}"><div class="dh tcol"></div>${dates.map(d =>
    `<div class="dh ${d === t ? "is-today" : ""}">${DAYS[wd(d)]}<span>${fmtDate(d)}</span></div>`).join("")}`;
  h += `<div class="tcol">${Array.from({ length: ge - gs }, (_, i) => `<div class="tl">${pad(gs + i)}.00</div>`).join("")}</div>`;
  for (const date of dates){
    const items = lessons.filter(l => l.date === date).map(l => ({ l, s: toMin(l.start), e: toMin(l.end) }));
    const lanes = []; items.forEach(it => { let li = lanes.findIndex(end => end <= it.s); if (li < 0){ li = lanes.length; lanes.push(0); } lanes[li] = it.e; it.lane = li; });
    items.forEach(it => { it.n = Math.max(1, ...items.filter(o => o.s < it.e && o.e > it.s).map(o => o.lane + 1)); });
    h += `<div class="day ${date === t ? "is-today" : ""}" data-act="emptySlot" data-day="${wd(date)}" data-date="${date}" data-gs="${gs}">${Array.from({ length: ge - gs }, () => `<div class="hr"></div>`).join("")}
      ${items.map(({ l, s, e, lane, n }) => {
        const top = (s - gs * 60) / 60 * HPX, ht = Math.max(22, (e - s) / 60 * HPX - 3);
        const ppl = D.participants(l);
        const names = ppl.map(p => `<span class="st ${l.absent[p.st.id] ? "abs" : ""}">• ${esc(p.st.name)}</span>`).join("");
        return `<button class="blk cls-${S.classes[l.classId]?.color || "gri"} ${l.cancelled ? "off" : ""} ${l.extraId ? "xtra" : ""}" data-act="lesson" ${lessonData(l)}
          style="top:${top + 1}px;height:${ht}px;left:calc(${lane / n * 100}% + 3px);width:calc(${100 / n}% - 6px)">
          <b>${esc(D.clsName(l.classId))}</b><span class="st num">${l.start}–${l.end}</span>${flags(l) ? `<span class="st">${flags(l)}</span>` : ""}
          ${(e - s) >= 90 ? names : `<span class="st">${esc(ppl.map(p => p.st.name).join(", "))}</span>`}</button>`;
      }).join("")}</div>`;
  }
  return h + `</div>`;
}

function agenda(dates, lessons){
  const t = D.today();
  return dates.map(date => { const ls = lessons.filter(l => l.date === date);
    return `<section class="aday ${date === t ? "is-today" : ""}">
      <div class="sec-head"><h3>${DAYS[wd(date)]} · ${fmtDate(date)}${date === t ? " · bugün" : ""}</h3>
        <button class="btn sm ghost" data-act="newExtra" data-date="${date}" aria-label="${fmtDate(date)} için telafi / ekstra ders ekle">+ Ekle</button></div>
      ${ls.length ? `<div class="list">${ls.map(l => { const ppl = D.participants(l);
        return `<button class="row ${l.cancelled ? "dim" : ""}" data-act="lesson" ${lessonData(l)}>
          ${ticket(l.classId, l.start, l.end)}
          <span class="main"><span class="sub chips">${chip(l.classId)}${flags(l)}</span>
            <span class="sub">${ppl.length ? ppl.map(p => `<span class="${l.absent[p.st.id] ? "abs" : ""}">${esc(p.st.name)}</span>`).join(", ") : "Öğrenci yok"}</span></span></button>`; }).join("")}</div>`
        : empty("Ders yok.")}
    </section>`; }).join("");
}

export function vProgram(){
  const mon = S.week, sun = addDays(mon, 6), t = D.today();
  const lessons = D.lessonsBetween(mon, sun);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(mon, i)).filter(d => wd(d) < 7 || lessons.some(l => l.date === d));
  let gs = 9, ge = 21;
  lessons.forEach(l => { gs = Math.min(gs, Math.floor(toMin(l.start) / 60)); ge = Math.max(ge, Math.ceil(toMin(l.end) / 60)); });
  const classes = Object.values(S.classes);
  const noSlot = classes.filter(c => !(c.slots || []).length);
  return `<div class="stack">
    <div class="sec-head"><h2>Ders programı</h2>
      <div class="toolbar">${SHARE ? "" : `<button class="btn" data-act="programPdf" title="Haftalık programı yatay A4 PDF olarak indir"><svg class="ico"><use href="#i-down"/></svg>PDF indir</button>`}<button class="btn" data-act="newExtra" data-date="${t >= mon && t <= sun ? t : mon}">+ Telafi / ekstra</button><button class="btn pri" data-act="newClass">+ Yeni grup / ders</button></div></div>
    <div class="weeknav"><button class="btn sm" data-act="week" data-d="-7" aria-label="Önceki hafta">‹</button>
      <strong class="num">${fmtDate(mon)} – ${fmtDate(sun)}</strong>
      <button class="btn sm" data-act="week" data-d="7" aria-label="Sonraki hafta">›</button>
      ${mon !== mondayOf(t) ? `<button class="btn sm ghost" data-act="week" data-d="0">Bu hafta</button>` : ""}</div>
    <p class="hint" style="margin:0">Bir derse dokununca o günkü iptali ve gelmeyenleri işaretleyebilirsin. Kesikli çerçeveli dersler tek seferlik telafi / ekstra derslerdir. Haftalık saatleri değiştirmek için dersi açıp “Grubu / dersi aç”a dokun.</p>
    ${!classes.length ? `<div class="panel">${empty("Henüz ders yok. “+ Yeni grup / ders” ile başlayabilirsin.")}</div>` : `
    <div class="pg-scroll wide-only">${grid(dates, lessons, gs, ge)}</div>
    <div class="agenda narrow-only">${agenda(dates, lessons)}</div>`}
    ${noSlot.length ? `<div class="panel stack" style="gap:8px"><h3>Programda saati olmayan dersler</h3><div class="legend">${noSlot.map(c =>
      `<button class="chip cls-${c.color || "gri"} chip-btn" data-act="classView" data-id="${c.id}">${esc(c.name)} · ${D.rosterOf(c.id).length} kişi</button>`).join("")}</div></div>` : ""}
  </div>`;
}

export const views = { program: vProgram };
export const actions = {
  // PDF araçları büyük; sadece bu düğmeye basılınca yüklenir.
  async programPdf(t){
    if (t.disabled) return;
    t.disabled = true; toast("PDF hazırlanıyor…");
    try { const { downloadProgramPdf } = await import("../pdf/program.js"); await downloadProgramPdf(); toast("Ders programı PDF olarak indirildi."); }
    catch(e){ console.error(e); toast("PDF hazırlanamadı. Tekrar dene."); }
    finally { t.disabled = false; }
  },
  week(t){ S.week = t.dataset.d === "0" ? mondayOf(D.today()) : addDays(S.week, Number(t.dataset.d)); },
  emptySlot(t, e){
    if (e.target.closest(".blk")) return;
    const rect = t.getBoundingClientRect(); const gs = Number(t.dataset.gs);
    const h = Math.max(0, Math.min(23, gs + Math.floor((e.clientY - rect.top) / HPX)));
    openSheet({ type: "emptyPick", day: Number(t.dataset.day), date: t.dataset.date, h });
  },
};
