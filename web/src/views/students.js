// Öğrenci listesi: bir satır = bir kişi; kayıtlı olduğu dersler satırın altında.
import { S, D } from "../app.js";
import { esc, lower } from "../lib/format.js";
import { chip, empty, duePill, classOptions, avatar } from "../ui.js";

const SELF = "__self";   // öğretmen filtresi: Kevser Hanım'ın kendi dersleri (hocası boş)

function filtered(){
  const q = lower(S.stuQ.trim());
  return Object.values(S.students)
    .filter(s => S.stuState === "tumu" || (S.stuState === "pasif" ? s.active === false : s.active !== false))
    .map(st => ({ st, enrs: D.enrollmentsOf(st.id, st.active === false) }))
    .filter(({ enrs }) => !S.stuCls || enrs.some(e => e.classId === S.stuCls))
    .filter(({ enrs }) => !S.stuTeacher || enrs.some(e => S.stuTeacher === SELF ? !e.teacher : e.teacher === S.stuTeacher))
    .filter(({ st, enrs }) => !q || lower([st.name, st.parentName, st.phone, ...enrs.map(e => D.clsName(e.classId))].join(" ")).includes(q))
    .sort((a, b) => a.st.name.localeCompare(b.st.name, "tr"));
}

export function vStudents(){
  const list = filtered();
  const anyStudent = Object.keys(S.students).length > 0;
  const anyFilter = S.stuQ || S.stuCls || S.stuTeacher || S.stuState !== "aktif";
  const teachers = D.teachers();
  return `<div class="stack">
    <div class="sec-head"><h2>Öğrenciler <span class="hint num">(${list.length})</span></h2><button class="btn pri" data-act="newStudent">+ Yeni öğrenci</button></div>
    <div class="filters">
      <input type="search" id="q" data-input="stuQ" placeholder="İsim, veli, telefon ya da ders ara" value="${esc(S.stuQ)}" aria-label="Ara" autocomplete="off">
      <select id="fstate" data-change="stuState" aria-label="Durum">
        <option value="aktif" ${S.stuState === "aktif" ? "selected" : ""}>Aktif</option>
        <option value="pasif" ${S.stuState === "pasif" ? "selected" : ""}>Pasif (ayrılan)</option>
        <option value="tumu" ${S.stuState === "tumu" ? "selected" : ""}>Tümü</option></select>
      <select id="fcls" data-change="stuCls" aria-label="Ders">${classOptions(S.stuCls, { placeholder: "Tüm dersler" })}</select>
      <select id="ftch" data-change="stuTeacher" aria-label="Öğretmen"><option value="">Tüm öğretmenler</option>
        <option value="${SELF}" ${S.stuTeacher === SELF ? "selected" : ""}>Kevser Hanım</option>
        ${teachers.map(t => `<option value="${esc(t.name)}" ${S.stuTeacher === t.name ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>
      ${anyFilter ? `<button class="btn ghost" data-act="clearStu">Filtreleri temizle</button>` : ""}
    </div>
    <div class="panel"><div class="list">${list.length ? list.map(({ st, enrs }) => {
      const s = st.active === false ? null : D.studentStatus(st.id);
      const tch = [...new Set(enrs.map(e => e.teacher).filter(Boolean))];
      const sub = [st.parentName && `Veli: ${st.parentName}`, tch.length && tch.join(", ")].filter(Boolean).join(" · ");
      return `<button class="row" data-act="profile" data-id="${st.id}">${avatar(st.name, enrs[0]?.classId)}
        <span class="main"><span class="name">${esc(st.name)}</span>
          <span class="sub chips">${enrs.length ? enrs.map(e => chip(e.classId)).join("") : `<span>Ders kaydı yok</span>`}</span>
          ${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</span>
        <span class="side">${st.active === false ? `<span class="pill none">Pasif</span>` : s ? duePill(s.r) : `<span class="pill none">Ders yok</span>`}</span></button>`; }).join("")
      : empty(!anyStudent ? "Henüz öğrenci eklenmedi. “+ Yeni öğrenci” ile başlayabilirsin." : S.stuState === "pasif" && !S.stuQ ? "Pasif öğrenci yok." : "Bu filtreyle öğrenci bulunamadı.")}</div></div>
  </div>`;
}

export const views = { ogrenciler: vStudents };
export const inputs = { stuQ(el){ S.stuQ = el.value; return true; } };
export const changes = {
  stuState(el){ S.stuState = el.value; return true; },
  stuCls(el){ S.stuCls = el.value; return true; },
  stuTeacher(el){ S.stuTeacher = el.value; return true; },
};
export const actions = { clearStu(){ Object.assign(S, { stuQ: "", stuState: "aktif", stuCls: "", stuTeacher: "" }); } };
