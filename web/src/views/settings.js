// Ayarlar (MVP): ders türleri + varsayılan ücretleri, öğretmenler + varsayılan payları, kullanıcı hesabı.
import { S, D, ctx, save, strip, toast } from "../app.js";
import { DEFAULT_KINDS, OWNER, isOwner } from "../domain.js";
import { esc, lower } from "../lib/format.js";

// Kaydedilmemiş değişiklikler veri yenilenince kaybolmasın diye taslakta tutulur.
// typed: ekranda henüz taslağa alınmamış yazı var (ekran yeniden çizilmeden önce okunur).
let draft = null, typed = false;
const current = () => draft || {
  kinds: D.kinds().map(k => ({ key: k.key, label: k.label, defaultRate: k.defaultRate ?? "" })),
  teachers: D.teachers().map(t => ({ name: t.name, share: t.share || "", orig: t.name })),
};
function capture(){
  if (!document.getElementById("setForm")) return;
  const rows = sel => [...document.querySelectorAll(sel)];
  draft = {
    kinds: rows("[data-kind-row]").map(r => ({ key: r.dataset.key, label: r.querySelector(".k-label").value, defaultRate: r.querySelector(".k-rate").value })),
    teachers: rows("[data-t-row]").map(r => ({ name: r.querySelector(".t-name").value, share: r.querySelector(".t-share").value, orig: r.dataset.orig || "" })),
  };
  typed = false;
}
const slug = s => lower(s).replace(/[çğıöşü]/g, c => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }[c])).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "tur";

function account(){
  if (ctx.db?.kind === "local") return `<p class="hint" style="margin:0">Demo modundasın: veriler yerel dosyadan okunuyor, değişiklikler kaydedilmez. Giriş ve şifre ayarları gerçek sürümde burada.</p>`;
  return `<dl class="kv"><dt>Hesap</dt><dd>${esc(S.user?.email || "–")}</dd><dt>Yetki</dt><dd>${S.user?.role === "admin" ? "Yönetici" : esc(S.user?.role || "–")}</dd></dl>
    <form id="pwForm" class="stack" novalidate style="gap:10px">
      <div class="fgrid"><label class="f">Yeni şifre<input id="pw1" type="password" autocomplete="new-password"></label>
        <label class="f">Yeni şifre (tekrar)<input id="pw2" type="password" autocomplete="new-password"></label></div>
      <div id="pwErr" class="err" role="alert"></div>
      <div class="toolbar"><button class="btn" type="submit">Şifreyi değiştir</button><button class="btn ghost" type="button" data-act="signOut">Çıkış yap</button></div>
    </form>`;
}

export function vSettings(){
  const d = current();
  const used = new Set(Object.values(S.classes).map(c => c.kind));
  return `<div class="stack">
    <h2>Ayarlar</h2>
    <form id="setForm" class="stack" novalidate>
      <section class="panel stack" style="gap:10px"><h3>Ders türleri ve varsayılan ücret</h3>
        <p class="hint" style="margin:0">Yeni öğrenci eklerken seçilen dersin türüne göre ücret kendiliğinden dolar (sonra değiştirilebilir).</p>
        ${d.kinds.map(k => `<div class="setrow" data-kind-row data-key="${esc(k.key)}">
          <input class="k-label" data-input="setDirty" aria-label="Tür adı" value="${esc(k.label)}">
          <input class="k-rate" data-input="setDirty" type="number" min="0" inputmode="numeric" aria-label="Varsayılan saat ücreti" placeholder="Saat ücreti" value="${esc(k.defaultRate)}">
          ${!DEFAULT_KINDS.some(x => x.key === k.key) && !used.has(k.key) ? `<button class="btn sm ghost" type="button" data-act="rmKind" data-key="${esc(k.key)}" aria-label="Türü kaldır">✕</button>` : `<span></span>`}</div>`).join("")}
        <div><button class="btn sm" type="button" data-act="addKind">+ Tür ekle</button></div>
      </section>
      <section class="panel stack" style="gap:10px"><h3>Öğretmenler ve varsayılan hoca payı</h3>
        <p class="hint" style="margin:0">Pay, ders ücretiyle aynı birimdedir (ör. saatlik 650 TL). Veliden alınan ücretin bu kadarı hocaya gider, kalanı Kevser Hanım'a kalır.</p>
        <div class="setrow owner"><span class="owner-name">${OWNER}</span><span class="hint">Kurs sahibi · hoca payı yok</span><span></span></div>
        ${d.teachers.length ? d.teachers.map((t, i) => `<div class="setrow" data-t-row data-orig="${esc(t.orig || "")}">
          <input class="t-name" data-input="setDirty" aria-label="Öğretmen adı" placeholder="ör. Selin Hoca" value="${esc(t.name)}">
          <input class="t-share" data-input="setDirty" type="number" min="0" inputmode="numeric" aria-label="Varsayılan hoca payı" placeholder="Pay (TL)" value="${esc(t.share)}">
          <button class="btn sm ghost" type="button" data-act="rmTeacher" data-i="${i}" aria-label="Öğretmeni kaldır">✕</button></div>`).join("") : `<div class="empty">Başka öğretmen yok.</div>`}
        <div><button class="btn sm" type="button" data-act="addTeacher">+ Öğretmen ekle</button></div>
      </section>
      <div id="formErr" class="err" role="alert"></div>
      <div class="toolbar"><button class="btn pri" type="submit">Ayarları kaydet</button>${draft ? `<button class="btn ghost" type="button" data-act="resetSettings">Değişiklikleri geri al</button>` : ""}</div>
    </form>
    <section class="panel stack" style="gap:10px"><h3>Kullanıcı hesabı</h3>${account()}</section>
  </div>`;
}

export const views = { ayarlar: vSettings };
export const beforeRender = () => { if (S.tab === "ayarlar" && typed) capture(); };

const edit = () => capture();
export const inputs = { setDirty(){ typed = true; } };
export const actions = {
  addKind(){ edit(); draft.kinds.push({ key: "", label: "", defaultRate: "" }); },
  rmKind(t){ edit(); draft.kinds = draft.kinds.filter(k => k.key !== t.dataset.key); },
  addTeacher(){ edit(); draft.teachers.push({ name: "", share: "", orig: "" }); },
  rmTeacher(t){
    edit(); const tr = draft.teachers[Number(t.dataset.i)];
    if (tr?.orig && Object.values(S.enrollments).some(e => e.active !== false && e.teacher === tr.orig))
      return toast(`${tr.orig} hâlâ derse giriyor. Önce öğrencilerin ders kaydından öğretmeni değiştir.`);
    draft.teachers.splice(Number(t.dataset.i), 1);
  },
  resetSettings(){ draft = null; typed = false; },
};

export const submits = {
  async setForm(f, err){
    capture();
    const kinds = [], keys = new Set();
    for (const k of draft.kinds){
      const label = k.label.trim(); if (!label){ if (!k.key) continue; return err("Ders türünün adı boş olamaz."); }
      let key = k.key || slug(label); while (keys.has(key)) key += "_2"; keys.add(key);
      kinds.push({ key, label, defaultRate: Number(k.defaultRate) || 0 });
    }
    const teachers = [], names = new Set();
    for (const t of draft.teachers){
      const name = t.name.trim().replace(/\s+/g, " "); if (!name) continue;
      if (names.has(lower(name))) return err(`“${name}” iki kez yazılmış.`);
      if (isOwner(name)) return err(`${OWNER} listede zaten var (en üstteki satır). Onun dersleri için hoca payı tutulmaz.`);
      names.add(lower(name)); teachers.push({ name, share: Number(t.share) || 0, orig: t.orig });
    }
    const keep = draft; draft = null;
    if (!(await save("settings", "main", { kinds, teachers: teachers.map(({ orig, ...t }) => t) }))){ draft = keep; return; }
    // Adı değişen öğretmeni ders kayıtlarında ve ödemelerde de güncelle (hoca payları doğru kişide kalsın).
    let n = 0;
    for (const t of teachers) if (t.orig && t.orig !== t.name){
      for (const e of Object.values(S.enrollments).filter(e => e.teacher === t.orig)){ await save("enrollments", e.id, { ...strip(e), teacher: t.name }); n++; }
      for (const p of Object.values(S.payments).filter(p => p.teacher === t.orig)) await save("payments", p.id, { ...strip(p), teacher: t.name });
    }
    toast(n ? `Ayarlar kaydedildi. ${n} ders kaydında öğretmen adı güncellendi.` : "Ayarlar kaydedildi.");
  },
  async pwForm(f){
    const e = m => { document.getElementById("pwErr").textContent = m; };
    const a = document.getElementById("pw1").value, b = document.getElementById("pw2").value;
    if (a.length < 8) return e("Şifre en az 8 karakter olmalı.");
    if (a !== b) return e("İki şifre aynı değil.");
    try { await ctx.db.auth.updatePassword(a); f.reset(); e(""); toast("Şifre değiştirildi."); }
    catch(x){ e("Şifre değiştirilemedi. Tekrar dene."); }
  },
};
