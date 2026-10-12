// Grup / ders: ayrıntı (öğrenciler + son dersler), düzenleme (haftalık saatler), programda boş saate dokununca seçenekler.
import { S, D, UI, save, remove, toast, openSheet, closeSheet, drawSheet } from "../app.js";
import { COLORS } from "../domain.js";

// Renk seçicide gösterilen adlar (style.css --c-*).
const COLOR_NAMES = { pembe: "pembe", turuncu: "turuncu", lila: "lila", mavi: "mavi", yesil: "yeşil", sari: "sarı", somon: "somon", turkuaz: "turkuaz", gri: "gri" };
import { esc, uid } from "../lib/format.js";
import { addDays, fmtDate, fmtDateLong, toMin, pad, DAYS } from "../lib/dates.js";
import { chip, empty, shHead, duePill, typeTag, rateText, teacherText } from "../ui.js";

const lessonData = l => `data-c="${l.classId}" data-date="${l.date}" data-s="${l.start}" data-x="${l.extraId || ""}"`;

function lessonSummary(l){
  if (l.cancelled) return `<span class="pill none">İptal</span>`;
  const n = Object.keys(l.absent).length;
  if (!D.isDone(l)) return `<span class="pill none">Planlı</span>`;
  return n ? `<span class="pill today">${n} gelmedi</span>` : `<span class="pill ok">Yapıldı</span>`;
}

function shClassView(){
  const c = S.classes[UI.sheet.id]; if (!c) return null;
  const roster = D.rosterOf(c.id); const t = D.today();
  const recent = D.classLessons(c.id, addDays(t, -28), addDays(t, 7)).reverse();
  return `${shHead(esc(c.name), `<button class="btn sm" data-act="editClass" data-id="${c.id}">Düzenle</button>`)}
    <div class="toolbar">${chip(c.id)}<span class="hint">${esc(D.kindLabel(c.kind))}</span>${c.capacity ? `<span class="hint num">Doluluk ${roster.length}/${c.capacity}</span>` : ""}</div>
    <section class="panel stack" style="gap:6px"><h3>Haftalık ders saatleri</h3>
      <div>${(c.slots || []).length ? c.slots.map(s => `${DAYS[s.day]} ${s.start}–${s.end}`).join("<br>") : `<span class="hint">Henüz saat eklenmedi. “Düzenle” ile ekleyebilirsin.</span>`}</div></section>
    <section class="panel stack" style="gap:6px"><div class="sec-head"><h3>Öğrenciler (${roster.length})</h3><button class="btn sm" data-act="newStudent" data-cls="${c.id}">+ Öğrenci ekle</button></div>
      <div class="list">${roster.length ? roster.map(({ e, st }) => `<button class="row" data-act="profile" data-id="${st.id}">
        <span class="main"><span class="name">${esc(st.name)}</span><span class="sub">${rateText(e)} · ${esc(teacherText(e))}</span></span>
        <span class="side">${duePill(D.status(e))}</span></button>`).join("") : empty("Bu derse kayıtlı öğrenci yok.")}</div></section>
    <section class="panel stack" style="gap:6px"><div class="sec-head"><h3>Son ve yaklaşan dersler</h3><button class="btn sm" data-act="newExtra" data-c="${c.id}">+ Telafi / ekstra</button></div>
      <div class="list">${recent.length ? recent.map(l => `<button class="row" data-act="lesson" ${lessonData(l)}>
        <span class="main"><span class="name">${fmtDateLong(l.date)}</span><span class="sub">${l.start}–${l.end} ${typeTag(l)}</span></span>
        <span class="side">${lessonSummary(l)}</span></button>`).join("") : empty("Son 4 haftada ders yok.")}</div></section>`;
}

function shClassForm(){
  const sh = UI.sheet; const c = sh.id ? S.classes[sh.id] : null;
  const d = c || { name: "", kind: "grup", color: "mavi", capacity: "", slots: sh.slot ? [sh.slot] : [] };
  const slots = sh.slotsDraft || (sh.slotsDraft = JSON.parse(JSON.stringify(d.slots || [])));
  const n = c ? D.rosterOf(c.id).length : 0;
  return `${shHead(c ? "Dersi düzenle" : "Yeni grup / ders")}
  <form id="clsForm" class="stack" novalidate>
    <label class="f">Ad<input id="c_name" value="${esc(sh.nameDraft ?? d.name)}" placeholder="ör. Rainbow ya da Özel – Ali"></label>
    <div class="fgrid"><label class="f">Tür<select id="c_kind">${D.kinds().map(k => `<option value="${esc(k.key)}" ${(sh.kindDraft || d.kind) === k.key ? "selected" : ""}>${esc(k.label)}</option>`).join("")}</select></label>
      <label class="f">Kapasite (isteğe bağlı)<input id="c_cap" type="number" min="0" inputmode="numeric" value="${esc(sh.capDraft ?? d.capacity ?? "")}"></label></div>
    <div class="f"><span class="flabel">Renk</span><div class="swatches">${COLORS.map(k => `<label class="cls-${k}" title="${COLOR_NAMES[k] || k}" aria-label="${COLOR_NAMES[k] || k}"><input type="radio" name="c_color" value="${k}" ${(sh.colorDraft || d.color) === k ? "checked" : ""}></label>`).join("")}</div></div>
    <h3>Haftalık ders saatleri</h3>
    <div class="stack" style="gap:8px">${slots.map((s, i) => `<div class="slotrow">
      <select data-change="slot" data-slot="${i}" data-k="day" aria-label="Gün">${[1, 2, 3, 4, 5, 6, 7].map(x => `<option value="${x}" ${Number(s.day) === x ? "selected" : ""}>${DAYS[x]}</option>`).join("")}</select>
      <input type="time" data-input="slot" data-change="slot" data-slot="${i}" data-k="start" value="${esc(s.start)}" aria-label="Başlangıç" step="900">
      <input type="time" data-input="slot" data-change="slot" data-slot="${i}" data-k="end" value="${esc(s.end)}" aria-label="Bitiş" step="900">
      <button class="btn sm ghost" type="button" data-act="rmSlot" data-i="${i}" aria-label="Saati kaldır">✕</button></div>`).join("") || `<div class="hint">Saat eklenmedi.</div>`}</div>
    <div><button class="btn sm" type="button" data-act="addSlot">+ Saat ekle</button></div>
    <p class="hint" style="margin:0">Buradaki saatler her hafta tekrar eder. Tek seferlik bir ders için “Telafi / ekstra ders” kullan.</p>
    <div id="formErr" class="err" role="alert"></div>
    <div class="toolbar"><button class="btn pri" type="submit">Kaydet</button><button class="btn" type="button" data-act="close">Vazgeç</button>
      ${c ? (n ? `<span class="hint">Silmek için önce ${n} öğrenciyi başka derse taşı.</span>` : (sh.confirmDel ? `<span class="confirm">Ders silinsin mi? <button class="btn sm danger" type="button" data-act="delClass">Evet, sil</button></span>` : `<button class="btn ghost danger" type="button" data-act="askDelClass">Dersi sil</button>`)) : ""}</div>
  </form>`;
}
function captureClassDraft(){
  const sh = UI.sheet; if (!sh || sh.type !== "classForm") return;
  sh.nameDraft = document.getElementById("c_name")?.value; sh.kindDraft = document.getElementById("c_kind")?.value; sh.capDraft = document.getElementById("c_cap")?.value;
  sh.colorDraft = document.querySelector("input[name=c_color]:checked")?.value;
}

const lessonsAt = (date, h) => D.lessonsOn(date).filter(l => toMin(l.start) < (h + 1) * 60 && toMin(l.end) > h * 60);
function shEmptyPick(){
  const sh = UI.sheet;
  const classes = Object.values(S.classes).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const busy = lessonsAt(sh.date, sh.h);
  return `${shHead(`${fmtDateLong(sh.date)} ${pad(sh.h)}.00`)}
    ${busy.length ? `<div class="banner">Bu saatte ders var: ${busy.map(l => esc(D.clsName(l.classId))).join(", ")}</div>` : `<div class="hint">Bu saat boş.</div>`}
    <section class="panel stack" style="gap:8px"><h3>Sadece bu tarihe</h3>
      <div><button class="btn pri" data-act="newExtra" data-date="${sh.date}" data-s="${pad(sh.h)}:00">+ Telafi / ekstra ders ekle</button></div>
      <p class="hint" style="margin:0">Haftalık programa eklenmez, sadece ${fmtDate(sh.date)} için geçerli olur.</p></section>
    <section class="panel stack" style="gap:8px"><h3>Her hafta ${DAYS[sh.day]} ${pad(sh.h)}.00</h3>
      <div><button class="btn" data-act="newClassForSlot">+ Bu saatte yeni grup / ders aç</button></div>
      <div class="list">${classes.map(c => `<button class="row" data-act="pickClassForSlot" data-id="${c.id}">
        <span class="main"><span class="name">${esc(c.name)}</span><span class="sub">${esc(D.kindLabel(c.kind))} · ${D.rosterOf(c.id).length} kişi${c.capacity ? ` / ${c.capacity}` : ""}</span></span>
        <span class="side"><span class="hint">Programa ekle</span></span></button>`).join("")}</div></section>`;
}

export const sheets = { classView: shClassView, classForm: shClassForm, emptyPick: shEmptyPick };

export const actions = {
  classView: (t, e) => { e.stopPropagation(); openSheet({ type: "classView", id: t.dataset.id }); },
  newClass: () => openSheet({ type: "classForm", form: true }),
  editClass: t => openSheet({ type: "classForm", form: true, id: t.dataset.id }),
  addSlot(){ captureClassDraft(); UI.sheet.slotsDraft.push({ day: 1, start: "17:00", end: "18:00" }); drawSheet(); },
  rmSlot(t){ captureClassDraft(); UI.sheet.slotsDraft.splice(Number(t.dataset.i), 1); drawSheet(); },
  askDelClass(){ captureClassDraft(); UI.sheet.confirmDel = true; drawSheet(); },
  async delClass(){ if (await remove("classes", UI.sheet.id)){ toast("Ders silindi."); closeSheet(); } },
  async pickClassForSlot(t){
    const sh = UI.sheet; const c = S.classes[t.dataset.id];
    const sl = { day: sh.day, start: `${pad(sh.h)}:00`, end: `${pad(sh.h + 1)}:00` };
    const { id, ...rest } = c;
    if (await save("classes", id, { ...rest, slots: [...(c.slots || []), sl] })){ toast(`${c.name} her hafta ${DAYS[sl.day]} ${sl.start} saatine eklendi.`); closeSheet(); }
  },
  newClassForSlot(){ const sh = UI.sheet; openSheet({ type: "classForm", form: true, slot: { day: sh.day, start: `${pad(sh.h)}:00`, end: `${pad(sh.h + 1)}:00` } }); },
};

const setSlot = el => { const d = UI.sheet?.slotsDraft; if (!d) return; d[Number(el.dataset.slot)][el.dataset.k] = el.dataset.k === "day" ? Number(el.value) : el.value; };
export const changes = { slot: setSlot };
export const inputs = { slot: setSlot };

export const submits = {
  async clsForm(f, err){
    captureClassDraft(); const sh = UI.sheet;
    const name = (sh.nameDraft || "").trim(); if (!name) return err("Derse bir ad ver.");
    for (const s of sh.slotsDraft){
      if (!s.start || !s.end) return err(`${DAYS[s.day]} saatinin başlangıç ve bitişini yaz.`);
      if (toMin(s.end) <= toMin(s.start)) return err(`${DAYS[s.day]} saatinde bitiş, başlangıçtan sonra olmalı.`);
    }
    const dup = Object.values(S.classes).find(c => c.name.trim().toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr") && c.id !== sh.id);
    if (dup) return err(`“${dup.name}” adında bir ders zaten var.`);
    const id = sh.id || uid("c");
    const data = { name, kind: sh.kindDraft || "grup", color: sh.colorDraft || "mavi", capacity: Number(sh.capDraft) || 0,
      slots: sh.slotsDraft.map(s => ({ day: Number(s.day), start: s.start, end: s.end })) };
    if (await save("classes", id, data)){ toast("Ders kaydedildi."); openSheet({ type: "classView", id }); }
  },
};
