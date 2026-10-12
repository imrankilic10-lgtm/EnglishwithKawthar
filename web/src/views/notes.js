// Notlar: günlük not defteri. Üstte hızlı yazma alanı; altında sabitlenenler ve günlere göre notlar.
import { S, D, save, remove, strip, toast } from "../app.js";
import { esc, uid, lower } from "../lib/format.js";
import { parse, wd, addDays, isDate, DAYS, MONTHS } from "../lib/dates.js";

const dayTitle = d => { const x = parse(d); return `${x.getDate()} ${MONTHS[x.getMonth()]}`; };
const dayTag = d => d === D.today() ? "Bugün" : d === addDays(D.today(), -1) ? "Dün" : `${DAYS[wd(d)]}${d.slice(0, 4) !== D.today().slice(0, 4) ? ` · ${d.slice(0, 4)}` : ""}`;
const timeOf = n => { const t = n.createdAt ? new Date(n.createdAt) : null; return t && !isNaN(t) ? t.toTimeString().slice(0, 5) : ""; };
const byNewest = (a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "");

function noteHTML(n){
  if (S.noteEdit === n.id) return `<div class="note ${n.pinned ? "pinned" : ""}">
    <span class="t">${timeOf(n)}</span>
    <div class="edit"><textarea id="n_edit" data-input="noteEditText" rows="4" aria-label="Notu düzenle">${esc(S.noteEditText)}</textarea>
      <div class="toolbar"><button class="btn pri sm" data-act="noteSave" data-id="${n.id}">Kaydet</button><button class="btn sm ghost" data-act="noteEditCancel">Vazgeç</button></div></div>
    <span></span></div>`;
  return `<div class="note ${n.pinned ? "pinned" : ""}">
    <span class="t">${n.pinned ? dayTitle(n.date) : timeOf(n)}</span>
    <div class="x">${esc(n.text)}</div>
    <div class="acts">${S.noteDel === n.id
      ? `<span class="confirm">Silinsin mi? <button class="btn xs danger" data-act="noteDel" data-id="${n.id}">Evet, sil</button><button class="btn xs ghost" data-act="noteDelCancel">Vazgeç</button></span>`
      : `<button class="btn xs ghost" data-act="notePin" data-id="${n.id}" aria-pressed="${!!n.pinned}" title="${n.pinned ? "Sabitlemeyi kaldır" : "En üste sabitle"}">${n.pinned ? "Sabitlemeyi kaldır" : "Sabitle"}</button>
         <button class="btn xs ghost" data-act="noteEdit" data-id="${n.id}">Düzenle</button>
         <button class="btn xs ghost danger" data-act="noteAskDel" data-id="${n.id}">Sil</button>`}</div>
  </div>`;
}

export function vNotes(){
  const q = lower(S.noteQ.trim());
  const all = Object.values(S.notes).sort(byNewest);
  const hit = all.filter(n => !q || lower(n.text).includes(q));
  const pinned = hit.filter(n => n.pinned);
  const days = new Map();
  hit.filter(n => !n.pinned).forEach(n => { if (!days.has(n.date)) days.set(n.date, []); days.get(n.date).push(n); });
  return `<div class="stack notes-page">
    <div class="sec-head"><h2>Notlar</h2></div>
    <form id="noteForm" class="panel note-new" novalidate>
      <textarea id="n_text" data-input="noteDraft" rows="3" placeholder="Aklındakini yaz: veli aramaları, hatırlatmalar, ders notları…" aria-label="Yeni not">${esc(S.noteDraft)}</textarea>
      <div class="bar">
        <label class="f">Tarih <input id="n_date" type="date" data-input="noteDate" value="${esc(S.noteDate || D.today())}"></label>
        <button class="btn pri" type="submit">Notu kaydet</button>
      </div>
      <div id="formErr" class="err" role="alert"></div>
    </form>
    ${all.length ? `<input type="search" id="nq" data-input="noteQ" placeholder="Notlarda ara" value="${esc(S.noteQ)}" aria-label="Notlarda ara" autocomplete="off">` : ""}
    ${pinned.length ? `<section class="note-day"><header><h3>Sabitlenenler</h3><small>${pinned.length} not</small></header>${pinned.map(noteHTML).join("")}</section>` : ""}
    ${[...days.entries()].map(([d, list]) => `<section class="note-day">
      <header><h3>${dayTitle(d)}</h3><small>${dayTag(d)}</small></header>${list.map(noteHTML).join("")}</section>`).join("")}
    ${!all.length ? `<p class="empty">Henüz not yok. İlk notunu yukarıya yazabilirsin; tarih kendiliğinden bugün olur.</p>`
      : !hit.length ? `<p class="empty">“${esc(S.noteQ)}” geçen not bulunamadı.</p>` : ""}
  </div>`;
}

export const views = { notlar: vNotes };
export const inputs = {
  noteDraft(el){ S.noteDraft = el.value; },
  noteDate(el){ S.noteDate = el.value; },
  noteEditText(el){ S.noteEditText = el.value; },
  noteQ(el){ S.noteQ = el.value; return true; },
};
export const actions = {
  async notePin(t){ const n = S.notes[t.dataset.id]; if (n && await save("notes", n.id, { ...strip(n), pinned: !n.pinned })) toast(n.pinned ? "Sabitleme kaldırıldı." : "Not en üste sabitlendi."); },
  noteEdit(t){ const n = S.notes[t.dataset.id]; if (!n) return; S.noteEdit = n.id; S.noteEditText = n.text; S.noteDel = null; setTimeout(() => document.getElementById("n_edit")?.focus(), 0); },
  noteEditCancel(){ S.noteEdit = null; },
  async noteSave(t){
    const n = S.notes[t.dataset.id]; const text = S.noteEditText.trim();
    if (!n) return;
    if (!text) return toast("Not boş olamaz. Silmek için “Sil”i kullan.");
    if (await save("notes", n.id, { ...strip(n), text })){ S.noteEdit = null; toast("Not güncellendi."); }
  },
  noteAskDel(t){ S.noteDel = t.dataset.id; S.noteEdit = null; },
  noteDelCancel(){ S.noteDel = null; },
  async noteDel(t){ if (await remove("notes", t.dataset.id)){ S.noteDel = null; toast("Not silindi."); } },
};
export const submits = {
  async noteForm(f, err){
    const text = S.noteDraft.trim(); const date = S.noteDate || D.today();
    if (!text) return err("Önce notu yaz.");
    if (!isDate(date)) return err("Tarihi seç.");
    if (await save("notes", uid("n"), { date, text, pinned: false, createdAt: new Date().toISOString() })){
      S.noteDraft = ""; S.noteDate = null; toast("Not kaydedildi.");
    }
  },
};
