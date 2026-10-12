// Tek bir ders: istisnaları işaretleme (iptal / gelmedi), ders ayrıntısı, telafi / ekstra ders ekleme.
import { S, D, UI, save, remove, strip, toast, openSheet, closeSheet, drawSheet } from "../app.js";
import { ATTEND, LESSON_TYPES, evId } from "../domain.js";
import { esc, uid } from "../lib/format.js";
import { fmtDate, fmtDateLong, toMin, fromMin, isDate, isTime, wd } from "../lib/dates.js";
import { chip, shHead, typeTag, classOptions } from "../ui.js";

const ATTEND_SHORT = { geldi: "Geldi", sayilir: "Gelmedi<br>sayılsın", sayilmaz: "Gelmedi<br>sayılmasın" };
const lessonData = l => `data-c="${l.classId}" data-date="${l.date}" data-s="${l.start}" data-x="${l.extraId || ""}"`;

// Günlük kullanımın ana parçası: ders programdan otomatik gelir, sadece istisna işaretlenir.
export function lessonCard(l, { detail = false } = {}){
  const people = D.participants(l);
  const data = lessonData(l);
  const body = l.cancelled
    ? `<div class="hint">İptal edilen ders kimsenin hakkından düşmez.</div>`
    : people.length ? people.map(({ st }) => {
        const a = l.absent[st.id] || "geldi";
        return `<div class="att ${a !== "geldi" ? "exc" : ""}">
          <button class="link" data-act="profile" data-id="${st.id}">${esc(st.name)}</button>
          <div class="seg3" role="group" aria-label="${esc(st.name)} katılım">${Object.entries(ATTEND_SHORT).map(([k, v]) =>
            `<button type="button" class="${k} ${a === k ? "on" : ""}" data-act="absentSet" data-v="${k}" ${data} data-st="${st.id}" aria-pressed="${a === k}" title="${ATTEND[k]}">${v}</button>`).join("")}</div></div>`;
      }).join("")
    : `<div class="hint">Bu derse kayıtlı öğrenci yok.</div>`;
  return `<div class="lesson ${l.cancelled ? "cancel" : ""}">
    <div class="lh"><span class="time num">${l.start}–${l.end}</span>${chip(l.classId)}${typeTag(l)}
      ${l.cancelled ? `<span class="pill late">İptal</span>` : ""}
      <span class="sp"></span>
      ${detail ? `<button class="btn sm ghost" data-act="lesson" ${data}>Ayrıntı</button>` : ""}
      <button class="btn sm" data-act="cancel" ${data}>${l.cancelled ? "İptali geri al" : "Dersi iptal et"}</button></div>
    ${l.note ? `<div class="hint">${esc(l.note)}</div>` : ""}
    ${body}
  </div>`;
}

// Boş istisna kaydı biriktirme: iptal yoksa ve herkes geldiyse kaydı sil.
async function saveEvent(id, ev){
  const blank = !ev.cancelled && !Object.keys(ev.absent || {}).length;
  if (blank) return S.events[id] ? remove("events", id) : true;
  return save("events", id, ev);
}

function shLesson(){
  const sh = UI.sheet; const l = D.findLesson(sh); if (!l) return null;
  const kind = l.type === "normal" ? "Haftalık ders" : `${LESSON_TYPES[l.type]} ders (programa bağlı değil)`;
  const del = !l.extraId ? "" : sh.confirmDel
    ? `<span class="confirm">Bu ders silinsin mi? <button class="btn sm danger" data-act="delExtra" data-id="${l.extraId}">Evet, sil</button></span>`
    : `<button class="btn ghost danger" data-act="askDelExtra">Dersi sil</button>`;
  return `${shHead(fmtDateLong(l.date))}
    <div class="hint">${kind}${D.isDone(l) ? " · yapıldı" : " · planlı"}</div>
    ${lessonCard(l)}
    <div class="toolbar"><button class="btn" data-act="classView" data-id="${l.classId}">Grubu / dersi aç</button>
      ${l.type === "normal" ? `<button class="btn" data-act="newExtra" data-c="${l.classId}">+ Telafi / ekstra ders</button>` : ""}${del}</div>
    <p class="hint" style="margin:0">Herkes geldiyse bir şey yapmana gerek yok. Gelmeyen öğrenci için "sayılsın" paket öğrencisinin hakkından düşer, "sayılmasın" düşmez.</p>`;
}

// ---------- telafi / ekstra ders ----------
function defaultsFor(classId, date){
  const cls = S.classes[classId]; const sl = (cls?.slots || []).find(s => Number(s.day) === wd(date)) || cls?.slots?.[0];
  return sl ? { start: sl.start, end: sl.end } : { start: "", end: "" };
}
function captureExtra(){
  const d = UI.sheet?.draft; if (!d) return;
  d.type = document.querySelector("input[name=x_type]:checked")?.value || d.type;
  d.classId = document.getElementById("x_cls")?.value ?? d.classId;
  d.date = document.getElementById("x_date")?.value ?? d.date;
  d.start = document.getElementById("x_start")?.value ?? d.start;
  d.end = document.getElementById("x_end")?.value ?? d.end;
  d.note = document.getElementById("x_note")?.value ?? d.note;
  const boxes = document.querySelectorAll("#xStudents input[type=checkbox]");
  if (boxes.length) d.studentIds = [...boxes].filter(b => b.checked).map(b => b.value);
}
function shExtraForm(){
  const d = UI.sheet.draft;
  const roster = d.classId ? D.rosterOf(d.classId) : [];
  const sel = new Set(d.studentIds ?? roster.map(r => r.st.id));
  return `${shHead("Telafi / ekstra ders")}
  <form id="extraForm" class="stack" novalidate>
    <div class="seg">${["telafi", "ekstra"].map(k => `<label><input type="radio" name="x_type" value="${k}" ${d.type === k ? "checked" : ""}>${LESSON_TYPES[k]}</label>`).join("")}</div>
    <label class="f">Ders<select id="x_cls" data-change="xCls">${classOptions(d.classId)}</select></label>
    <div class="fgrid">
      <label class="f">Tarih<input id="x_date" type="date" value="${esc(d.date)}"></label>
      <label class="f">Başlangıç<input id="x_start" type="time" step="900" value="${esc(d.start)}"></label>
      <label class="f">Bitiş<input id="x_end" type="time" step="900" value="${esc(d.end)}"></label>
    </div>
    <fieldset class="f"><legend>Öğrenciler</legend>
      <div id="xStudents" class="checks">${!d.classId ? `<span class="hint">Önce dersi seç.</span>` : roster.length
        ? roster.map(({ st }) => `<label><input type="checkbox" value="${st.id}" ${sel.has(st.id) ? "checked" : ""}>${esc(st.name)}</label>`).join("")
        : `<span class="hint">Bu derse kayıtlı öğrenci yok.</span>`}</div></fieldset>
    <label class="f">Not (isteğe bağlı)<input id="x_note" value="${esc(d.note)}" placeholder="ör. 6 Ekim'de iptal edilen dersin telafisi"></label>
    <p class="hint" style="margin:0">Bu ders sadece seçtiğin tarihte yapılır, haftalık programa eklenmez. Paket öğrencilerinde ders saatinden düşer.</p>
    <div id="formErr" class="err" role="alert"></div>
    <div class="toolbar"><button class="btn pri" type="submit">Dersi ekle</button><button class="btn" type="button" data-act="close">Vazgeç</button></div>
  </form>`;
}

export const sheets = { lesson: shLesson, extraForm: shExtraForm };

export const actions = {
  absentSet: t => { if (t.getAttribute("aria-pressed") !== "true") return setAbsent(t.dataset, t.dataset.v); },
  lesson: t => openSheet({ type: "lesson", classId: t.dataset.c, date: t.dataset.date, start: t.dataset.s, extraId: t.dataset.x || null }),
  async cancel(t){
    const { c, date, s, x } = t.dataset;
    if (x){
      const ex = S.extras[x]; if (!ex) return;
      if (await save("extras", x, { ...strip(ex), cancelled: !ex.cancelled })) toast(ex.cancelled ? "İptal geri alındı." : "Ders iptal edildi.");
      return;
    }
    const id = evId(c, date, s);
    const ev = S.events[id] || { classId: c, date, start: s, cancelled: false, absent: {} };
    if (await saveEvent(id, { ...strip(ev), cancelled: !ev.cancelled })) toast(ev.cancelled ? "İptal geri alındı." : "Ders iptal edildi. Kimsenin hakkından düşmeyecek.");
  },
  newExtra(t){
    const date = t.dataset.date || D.today(); const classId = t.dataset.c || "";
    const times = t.dataset.s ? { start: t.dataset.s, end: fromMin(Math.min(toMin(t.dataset.s) + 60, 23 * 60 + 45)) } : defaultsFor(classId, date);
    openSheet({ type: "extraForm", form: true, draft: { type: "telafi", classId, date, ...times, studentIds: t.dataset.st ? [t.dataset.st] : null, note: "" } });
  },
  askDelExtra(){ UI.sheet.confirmDel = true; drawSheet(); },
  async delExtra(t){ if (await remove("extras", t.dataset.id)){ toast("Ders silindi."); closeSheet(); } },
};

// Bir öğrencinin bir dersteki durumu: geldi | sayilir | sayilmaz
async function setAbsent({ c, date, s, x, st }, value){
  const apply = ev => { const absent = { ...(ev.absent || {}) }; if (value === "geldi") delete absent[st]; else absent[st] = value; return { ...strip(ev), absent }; };
  let ok;
  if (x){ const ex = S.extras[x]; if (!ex) return; ok = await save("extras", x, apply(ex)); }
  else { const id = evId(c, date, s); ok = await saveEvent(id, apply(S.events[id] || { classId: c, date, start: s, cancelled: false, absent: {} })); }
  if (ok) toast(value === "geldi" ? "Geldi olarak işaretlendi." : `${ATTEND[value]} olarak işaretlendi.`);
}

export const changes = {
  xCls(){
    captureExtra(); const d = UI.sheet.draft;
    d.studentIds = null;
    if (!d.start || !d.end) Object.assign(d, defaultsFor(d.classId, d.date || D.today()));
    drawSheet();
  },
};

export const submits = {
  async extraForm(f, err){
    captureExtra(); const d = UI.sheet.draft;
    if (!d.classId) return err("Dersi seç.");
    if (!isDate(d.date)) return err("Tarihi seç.");
    if (!isTime(d.start) || !isTime(d.end)) return err("Başlangıç ve bitiş saatini yaz.");
    if (toMin(d.end) <= toMin(d.start)) return err("Bitiş saati başlangıçtan sonra olmalı.");
    if (!d.studentIds?.length) return err("En az bir öğrenci seç.");
    const clash = D.lessonsOn(d.date).find(l => l.classId === d.classId && !l.cancelled && toMin(l.start) < toMin(d.end) && toMin(l.end) > toMin(d.start));
    if (clash && !UI.sheet.clashOk){ UI.sheet.clashOk = true; return err(`Bu derste ${fmtDate(d.date)} ${clash.start}–${clash.end} zaten ders var. Yine de eklemek için tekrar "Dersi ekle"ye bas.`); }
    const id = uid("x");
    const rec = { classId: d.classId, date: d.date, start: d.start, end: d.end, type: d.type, studentIds: d.studentIds, note: d.note.trim(), cancelled: false, absent: {} };
    if (await save("extras", id, rec)){
      toast(`${fmtDate(d.date)} ${d.start} ${LESSON_TYPES[d.type].toLocaleLowerCase("tr")} dersi eklendi.`);
      openSheet({ type: "lesson", extraId: id });
    }
  },
};
