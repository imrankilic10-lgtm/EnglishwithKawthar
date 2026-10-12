// Öğrenci profili, yeni öğrenci formu (kişi + ilk ders kaydı), kişi düzenleme, ders kaydı ekleme/düzenleme.
import { S, D, UI, save, remove, toast, openSheet, drawSheet } from "../app.js";
import { PAYMODES, OWNER, isOwner } from "../domain.js";
import { esc, TL, fmtH, uid, lower } from "../lib/format.js";
import { addDays, wd, fmtDate, fmtDateYear, fmtDateLong, DAYS, DAYS_S, MONTHS, isDate } from "../lib/dates.js";
import { chip, empty, shHead, duePill, attendPill, typeTag, payDesc, modeLabel, rateText, teacherText, unitLabel, classOptions, packageText, avatar, ticket } from "../ui.js";

const MONTHS_S = MONTHS.map(m => m.slice(0, 3));

const $ = s => document.querySelector(s);
const slotsText = cls => (cls?.slots || []).length ? cls.slots.map(s => `${DAYS[s.day]} ${s.start}–${s.end}`).join(" · ") : "Programda saati yok";
const lessonData = l => `data-c="${l.classId}" data-date="${l.date}" data-s="${l.start}" data-x="${l.extraId || ""}"`;

// ---------- profil ----------
// Ödeme şeridi: eğitim yılının ayları küçük kareler halinde (ödeme tablosuyla aynı renk ve hesap).
const STRIP_CLS = { odendi: "s-paid", bekliyor: "s-due", gecikti: "s-late", gelecek: "s-fut", yok: "s-none" };
const STRIP_TXT = { odendi: "ödendi", bekliyor: "bekliyor", gecikti: "gecikti", gelecek: "zamanı gelmedi", yok: "kayıt yok" };
function payStrip(e){
  const now = D.today().slice(0, 7);
  const keys = D.seasonMonths(D.seasonOf(D.today())).filter((k, i) => i < 9 || k <= now);
  const cells = D.monthCells(e, keys);
  return `<div class="strip" role="list" aria-label="Bu eğitim yılının ödeme durumu">${cells.map(c => {
    const m = MONTHS_S[Number(c.key.slice(5)) - 1];
    const amt = c.status === "odendi" ? c.paid : c.status === "gelecek" ? c.expected : c.due;
    return `<span class="sc ${STRIP_CLS[c.status]} ${c.key === now ? "cur" : ""}" role="listitem" title="${m}: ${STRIP_TXT[c.status]}${amt ? ` · ${TL(amt)}` : ""}${c.partial ? " (kısmi)" : ""}"><i></i><small>${m}</small></span>`;
  }).join("")}</div>`;
}
// Sıradaki ödeme kutusu (mor): tutar, son gün, kısmi ödemede ilerleme, "Ödeme al".
function dueBox(st, e, r){
  const part = r.paid ? Math.round(r.paid / (r.paid + r.amount) * 100) : 0;
  const late = r.level === "late";
  return `<div class="duebox">
    <div class="db-top"><span>Sıradaki ödeme · ${esc(r.periodLabel)}${r.paid ? " (kalan)" : ""}</span>${late ? `<span class="db-late">gecikti</span>` : ""}</div>
    <div class="db-mid"><b class="num">${TL(r.amount)}</b><button class="chipbtn" data-act="pay" data-id="${st.id}" data-e="${e.id}" data-back="1">Ödeme al</button></div>
    ${r.paid ? `<div class="db-bar"><i style="width:${part}%"></i></div><div class="db-n">${TL(r.paid + r.amount)} tutarın ${TL(r.paid)}'si alındı</div>` : ""}
    <div class="db-n num">${r.dueDate ? `Son gün ${fmtDate(r.dueDate)}` : "Programda ders yok"}${r.mode === "paket" ? ` · ${packageText(r)}` : ""}</div>
  </div>`;
}
function enrollmentCard(e){
  const st = S.students[e.studentId]; const cls = S.classes[e.classId]; const t = D.today();
  const on = D.isActiveEnr(e); const r = on ? D.status(e) : null;
  const past = D.lessonsOfEnrollment(e, e.startDate || addDays(t, -120), t).filter(D.isDone).reverse();
  const next = on ? D.lessonsOfEnrollment(e, t, addDays(t, 21)).filter(l => !D.isDone(l)).slice(0, 3) : [];
  const all = UI.sheet.all?.[e.id]; const hist = all ? past : past.slice(0, 4);
  return `<section class="panel stack enr" style="gap:14px">
    <div class="sec-head"><div class="toolbar">${chip(e.classId)}<span class="hint">${esc(D.kindLabel(cls?.kind))}</span>${e.active === false ? `<span class="pill none">Bıraktı</span>` : ""}</div>
      <button class="btn sm ghost" data-act="editEnroll" data-id="${e.id}">Düzenle</button></div>
    ${r ? dueBox(st, e, r) : ""}
    ${payStrip(e)}
    <dl class="kv">
      <dt>Öğretmen</dt><dd>${esc(teacherText(e))}${e.teacher && e.teacherShare ? ` <span class="hint">· hoca payı ${TL(e.teacherShare)} / ${unitLabel(e)}</span>` : ""}</dd>
      <dt>Ücret</dt><dd class="num">${rateText(e)} · <span class="hint">${modeLabel(e)}: ${payDesc(e)}</span></dd>
      <dt>Program</dt><dd>${slotsText(cls)}${next.length ? `<br><span class="hint">Sıradaki: ${next.map(l => `${fmtDate(l.date)} ${l.start}${l.type !== "normal" ? ` (${l.type})` : ""}`).join(", ")}</span>` : ""}</dd>
      <dt>Başlangıç</dt><dd>${fmtDateYear(e.startDate)}</dd>
    </dl>
    <div class="stack" style="gap:4px"><div class="sec-head"><h3>Ders geçmişi</h3>${on ? `<button class="btn sm ghost" data-act="newExtra" data-c="${e.classId}" data-st="${st.id}">+ Telafi / ekstra</button>` : ""}</div>
      ${hist.length ? `<div class="list">${hist.map(l => `<button class="row" data-act="lesson" ${lessonData(l)}>
        ${ticket(l.classId, DAYS_S[wd(l.date)], l.start)}
        <span class="main"><span class="name">${fmtDate(l.date)}</span><span class="sub">${l.start}–${l.end} ${typeTag(l)}</span></span>
        <span class="side">${attendPill(D.attendanceOf(l, st.id))}</span></button>`).join("")}</div>` : empty("Henüz yapılmış ders yok.")}
      ${past.length > 4 ? `<div><button class="btn sm ghost" data-act="toggleHist" data-id="${e.id}">${all ? "Daha az göster" : `Tüm geçmiş (${past.length} ders)`}</button></div>` : ""}</div>
  </section>`;
}

function exceptionsSection(st, enrs){
  const t = D.today();
  const items = enrs.flatMap(e => D.lessonsOfEnrollment(e, e.startDate || addDays(t, -120), addDays(t, 60))
    .filter(l => l.cancelled || l.absent[st.id] || l.type !== "normal").map(l => ({ l, e })))
    .sort((a, b) => b.l.date.localeCompare(a.l.date));
  return `<section class="panel stack" style="gap:6px"><h3>Ders istisnaları ve telafi / ekstra dersler</h3>
    ${items.length ? `<div class="list">${items.map(({ l }) => `<button class="row" data-act="lesson" ${lessonData(l)}>
      <span class="main"><span class="name">${fmtDate(l.date)} · ${l.start}</span><span class="sub chips">${chip(l.classId)}${typeTag(l)}</span></span>
      <span class="side">${attendPill(D.attendanceOf(l, st.id), !D.isDone(l))}</span></button>`).join("")}</div>`
      : empty("İstisna yok. Bütün dersler programa göre yapıldı.")}</section>`;
}

function paymentsSection(st){
  const pays = D.paymentsOfStudent(st.id);
  return `<section class="panel stack" style="gap:6px"><h3>Ödeme geçmişi</h3>
    ${pays.length ? `<div class="list">${pays.map(p => { const e = S.enrollments[p.enrollmentId];
      return `<div class="row static">
        <span class="main"><span class="name">${esc(p.label || "")}</span>
          <span class="sub chips">${e ? chip(e.classId) : ""}<span>${fmtDate(p.date)} ödendi</span>${p.note ? `<span>· ${esc(p.note)}</span>` : ""}</span>
          ${p.teacherCut ? `<span class="sub">Hoca payı ${TL(p.teacherCut)} · ${p.teacherPaid ? "hocaya ödendi" : "hocaya ödenmedi"}</span>` : ""}</span>
        <span class="side"><span class="amt num">${TL(p.amount)}</span>
          ${UI.sheet.confirmDel === p.id ? `<button class="btn sm danger" data-act="delPay" data-id="${p.id}">Evet, sil</button>` : `<button class="btn sm ghost" data-act="askDelPay" data-id="${p.id}" aria-label="Ödemeyi sil">Sil</button>`}</span>
      </div>`; }).join("")}</div>` : empty("Henüz ödeme kaydı yok.")}</section>`;
}

function shProfile(){
  const st = S.students[UI.sheet.id]; if (!st) return null;
  const enrs = D.enrollmentsOf(st.id, true);
  const current = enrs.filter(e => e.active !== false), ended = enrs.filter(e => e.active === false);
  const phone = (st.phone || "").replace(/[^\d+]/g, "");
  const tab = UI.sheet.ptab || "dersler";
  const pays = D.paymentsOfStudent(st.id).length;
  const tabs = [["dersler", `Dersler (${current.length})`], ["odemeler", `Ödemeler (${pays})`], ["istisna", "İstisnalar"]];
  return `${shHead(esc(st.name), `<button class="btn sm" data-act="editStudent" data-id="${st.id}">Düzenle</button>`)}
    <section class="panel pcard">
      <div class="pc-top">${avatar(st.name, current[0]?.classId || enrs[0]?.classId, "lg")}
        <div class="pc-n"><b>${esc(st.name)}</b><span class="hint">${st.parentName ? `Veli: ${esc(st.parentName)}` : "Veli bilgisi yok"} · başlangıç ${fmtDate(st.startDate)}</span>
          ${phone ? `<a class="pc-tel num" href="tel:${esc(phone)}">${esc(st.phone)}</a>` : ""}</div></div>
      <div class="toolbar">${st.active === false ? `<span class="pill none">Pasif · ayrıldı</span>` : `<span class="pill ok">Aktif</span>`}${current.map(e => chip(e.classId)).join("")}</div>
      ${st.notes ? `<p class="pc-note notes">${esc(st.notes)}</p>` : ""}
    </section>
    <div class="ptabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" data-act="ptab" data-t="${k}">${l}</button>`).join("")}</div>
    ${tab === "dersler" ? `
      ${current.length ? current.map(enrollmentCard).join("") : `<div class="panel">${empty("Aktif ders kaydı yok. “+ Ders ekle” ile bir derse kaydedebilirsin.")}</div>`}
      <div><button class="btn sm" data-act="newEnroll" data-id="${st.id}">+ Ders ekle</button></div>
      ${ended.length ? `<details class="panel"><summary>Bıraktığı dersler (${ended.length})</summary><div class="stack" style="margin-top:12px">${ended.map(enrollmentCard).join("")}</div></details>` : ""}`
    : tab === "odemeler" ? paymentsSection(st) : exceptionsSection(st, enrs)}`;
}

// ---------- ders kaydı alanları (yeni öğrenci formu + ders kaydı formu ortak) ----------
function enrollFields(d, { full }){
  const p = d.pay || {}; const mode = p.mode || "aylik";
  const teachers = D.teachers();
  return `<label class="f">Ders / kurs<select id="f_cls" data-change="enrRecalc">${classOptions(d.classId, { withNew: true })}</select></label>
    <div class="fgrid">
      <label class="f">Öğretmen<input id="f_teacher" list="tlist" autocomplete="off" data-input="teacherInput" placeholder="${OWNER}" value="${esc(d.teacher || OWNER)}">
        <datalist id="tlist"><option value="${OWNER}">${teachers.map(t => `<option value="${esc(t.name)}">`).join("")}</datalist></label>
      <label class="f" id="shareWrap" ${isOwner(d.teacher) ? "hidden" : ""}>Hoca payı (TL / <span id="unitLbl">${d.rateUnit === "hafta" ? "hafta" : "saat"}</span>)
        <input id="f_share" type="number" min="0" inputmode="numeric" value="${esc(d.teacherShare || "")}"></label>
    </div>
    <div class="f"><span class="flabel">Ödeme tipi</span>
      <div class="seg">${Object.entries(PAYMODES).map(([k, v]) => `<label><input type="radio" name="mode" value="${k}" data-change="enrRecalc" ${mode === k ? "checked" : ""}>${v}</label>`).join("")}</div></div>
    <div class="fgrid">
      <label class="f">Ders ücreti (TL)<input id="f_rate" type="number" min="0" inputmode="numeric" data-input="enrRecalc" value="${esc(d.rate || "")}"></label>
      ${full ? `<label class="f">Ücret birimi<select id="f_unit" data-change="enrRecalc"><option value="saat" ${d.rateUnit !== "hafta" ? "selected" : ""}>Saat başı</option><option value="hafta" ${d.rateUnit === "hafta" ? "selected" : ""}>Hafta başı</option></select></label>` : ""}
      <label class="f" data-mode="aylik haftalik"><span id="amtLbl">${mode === "haftalik" ? "Haftalık" : "Aylık"} tutar (TL)</span><input id="f_amt" type="number" min="0" inputmode="numeric" data-input="amtInput" value="${esc(p.amount || "")}"></label>
      <label class="f" data-mode="paket">Paket kaç saat<input id="f_pk" type="number" min="1" inputmode="numeric" data-input="enrRecalc" value="${esc(p.packageHours || 8)}"></label>
      ${full ? `<label class="f" data-mode="aylik">Ayın kaçında ödüyor<input id="f_dday" type="number" min="1" max="31" inputmode="numeric" value="${esc(mode === "aylik" ? p.dueDay || 1 : 1)}"></label>
        <label class="f" data-mode="haftalik">Ödeme günü<select id="f_wday">${[1, 2, 3, 4, 5, 6, 7].map(i => `<option value="${i}" ${mode === "haftalik" && Number(p.dueDay || 1) === i ? "selected" : ""}>${DAYS[i]}</option>`).join("")}</select></label>` : ""}
    </div>
    <div class="hint" id="amtHint"></div>`;
}

// Ders, ücret ve ödeme tipine göre tutarı önerir; kullanıcı elle değiştirdiyse dokunmaz.
function recalc(){
  const cls = S.classes[$("#f_cls")?.value];
  const mode = document.querySelector("input[name=mode]:checked")?.value || "aylik";
  const unit = $("#f_unit")?.value || "saat";
  const rateEl = $("#f_rate"), amt = $("#f_amt"), hint = $("#amtHint");
  if (!rateEl) return;
  const kind = cls && D.kinds().find(k => k.key === cls.kind);
  if (kind?.defaultRate && (!rateEl.value || rateEl.dataset.auto)){ rateEl.value = kind.defaultRate; rateEl.dataset.auto = "1"; }
  document.querySelectorAll("[data-mode]").forEach(el => { el.hidden = !el.dataset.mode.split(" ").includes(mode); });
  $("#amtLbl").textContent = `${mode === "haftalik" ? "Haftalık" : "Aylık"} tutar (TL)`;
  if ($("#unitLbl")) $("#unitLbl").textContent = unit;
  const rate = Number(rateEl.value) || 0, wh = D.weeklyHours(cls);
  let text = "";
  if (mode === "paket"){
    const pk = Number($("#f_pk").value) || 0;
    text = rate && pk ? `Paket tutarı: ${TL(rate * pk)} (${pk} saat × ${TL(rate)}). Dersler yapıldıkça kalan saat otomatik düşer.` : "";
  } else if (rate){
    const weeks = mode === "aylik" ? 4 : 1;
    const hours = unit === "hafta" ? null : wh * weeks;
    const auto = unit === "hafta" ? rate * weeks : wh ? rate * hours : null;
    if (auto != null && (!amt.value || amt.dataset.auto)){ amt.value = auto; amt.dataset.auto = "1"; }
    if (auto != null) text = `Önerilen: ${TL(auto)} = ${TL(rate)} × ${unit === "hafta" ? `${weeks} hafta` : `${fmtH(hours)} saat`}${mode === "aylik" ? " (ayda 4 hafta)" : ""}. Gerekirse değiştir.`;
    else if (cls) text = "Bu dersin programda saati yok; tutarı elle yaz.";
  }
  hint.textContent = text;
}

// Formdan ders kaydı alanlarını okur ve doğrular. Hata varsa metin döndürür.
function readEnroll(){
  const classId = $("#f_cls").value;
  const mode = document.querySelector("input[name=mode]:checked")?.value || "aylik";
  const rate = Number($("#f_rate").value);
  // Kevser Hanım (ya da boş) = kurs sahibi: öğretmen alanı boş saklanır, hoca payı yok.
  const teacher = isOwner($("#f_teacher").value) ? "" : $("#f_teacher").value.trim().replace(/\s+/g, " ");
  const teacherShare = teacher ? Number($("#f_share").value) || 0 : 0;
  const rateUnit = $("#f_unit")?.value || "saat";
  if (!classId) return { error: "Ders / kurs seç." };
  if (!(rate > 0)) return { error: "Ders ücretini yaz." };
  if (teacher && teacherShare > rate) return { error: "Hoca payı ders ücretinden büyük olamaz." };
  const pay = { mode };
  if (mode === "paket"){
    pay.packageHours = Number($("#f_pk").value);
    if (!(pay.packageHours > 0)) return { error: "Paketin kaç saat olduğunu yaz." };
  } else {
    pay.amount = Number($("#f_amt").value);
    if (!(pay.amount > 0)) return { error: mode === "aylik" ? "Aylık tutarı yaz." : "Haftalık tutarı yaz." };
    pay.dueDay = mode === "aylik" ? Number($("#f_dday")?.value || 1) : Number($("#f_wday")?.value || 1);
    if (mode === "aylik" && !(pay.dueDay >= 1 && pay.dueDay <= 31)) return { error: "Ödeme günü 1 ile 31 arasında olmalı." };
  }
  return { classId, teacher, teacherShare, rate, rateUnit, pay };
}
async function ensureClass(classId, studentName){
  if (classId !== "__new") return classId;
  const cid = uid("c");
  const ok = await save("classes", cid, { name: `Özel – ${studentName}`, kind: "ozel", color: "somon", capacity: 1, slots: [] });
  return ok ? cid : null;
}
const phoneError = p => p && p.replace(/\D/g, "").length < 10 ? "Telefon numarası eksik görünüyor (en az 10 rakam)." : "";

// ---------- yeni öğrenci / kişi düzenleme ----------
function shStudentForm(){
  const sh = UI.sheet; const st = sh.id ? S.students[sh.id] : null;
  const d = st || { name: "", parentName: "", phone: "", startDate: D.today(), notes: "", active: true };
  const person = `<label class="f">Ad soyad<input id="f_name" autocomplete="off" value="${esc(d.name)}"></label>
    <div class="fgrid">
      <label class="f">Veli adı<input id="f_parent" autocomplete="off" value="${esc(d.parentName || "")}"></label>
      <label class="f">Telefon<input id="f_phone" type="tel" inputmode="tel" autocomplete="off" value="${esc(d.phone || "")}" placeholder="05xx xxx xx xx"></label>
      <label class="f">Başlangıç tarihi<input id="f_start" type="date" value="${esc(d.startDate || D.today())}"></label>
    </div>`;
  const notes = `<label class="f">Not<textarea id="f_notes" rows="3">${esc(d.notes || "")}</textarea></label>`;
  if (st) return `${shHead("Öğrenciyi düzenle")}
    <form id="stForm" class="stack" novalidate>${person}${notes}
      <div class="seg"><label><input type="checkbox" id="f_active" ${d.active !== false ? "checked" : ""}>Aktif öğrenci</label></div>
      <p class="hint" style="margin:-8px 0 0">Ayrılan öğrencinin işaretini kaldır. Silinmez; ödeme ve ders geçmişi korunur, listede “Pasif” filtresiyle bulunur. Sadece bir dersi bıraktıysa o dersin “Düzenle” bölümünü kullan.</p>
      <div id="formErr" class="err" role="alert"></div>
      <div class="toolbar"><button class="btn pri" type="submit">Kaydet</button><button class="btn" type="button" data-act="close">Vazgeç</button></div>
    </form>`;
  return `${shHead("Yeni öğrenci")}
    <form id="stForm" class="stack" novalidate>${person}
      <h3>Ders</h3>
      ${enrollFields({ classId: sh.classId || "", pay: { mode: "aylik" } }, { full: false })}
      ${notes}
      <p class="hint" style="margin:0">Öğrenci başka bir derse de gidiyorsa kaydettikten sonra profilinden “+ Ders ekle” ile eklersin. Ödeme günü gibi ayrıntılar da profilden düzenlenir.</p>
      <div id="formErr" class="err" role="alert"></div>
      <div class="toolbar"><button class="btn pri" type="submit">Kaydet</button><button class="btn" type="button" data-act="close">Vazgeç</button></div>
    </form>`;
}

// ---------- ders kaydı ekle / düzenle ----------
function shEnrollForm(){
  const sh = UI.sheet; const e = sh.id ? S.enrollments[sh.id] : null;
  const st = S.students[e ? e.studentId : sh.studentId]; if (!st) return null;
  const d = e || { classId: "", teacher: "", teacherShare: "", rate: "", rateUnit: "saat", pay: { mode: "aylik", dueDay: 1 }, startDate: D.today(), active: true };
  const paid = e ? D.paymentsOfEnr(e.id).length : 0;
  return `${shHead(e ? "Ders kaydını düzenle" : "Ders ekle")}
    <div class="hint">${esc(st.name)}</div>
    <form id="enrForm" class="stack" novalidate>
      ${enrollFields(d, { full: true })}
      <label class="f">Bu derse başlangıç tarihi<input id="f_estart" type="date" value="${esc(d.startDate || D.today())}"></label>
      ${e ? `<div class="seg"><label><input type="checkbox" id="f_eactive" ${d.active !== false ? "checked" : ""}>Bu derse devam ediyor</label></div>
        <p class="hint" style="margin:-8px 0 0">Öğrenci bu dersi bıraktıysa işareti kaldır. Kayıt silinmez${paid ? `, ${paid} ödeme kaydı korunur` : ""}.</p>` : ""}
      <div id="formErr" class="err" role="alert"></div>
      <div class="toolbar"><button class="btn pri" type="submit">Kaydet</button><button class="btn" type="button" data-act="close">Vazgeç</button></div>
    </form>`;
}

const initEnrollForm = () => { recalc(); };

export const sheets = { profile: shProfile, studentForm: shStudentForm, enrollForm: shEnrollForm };

export const actions = {
  profile: t => openSheet({ type: "profile", id: t.dataset.id }),
  newStudent: t => openSheet({ type: "studentForm", form: true, classId: t.dataset.cls || "", onDraw: initEnrollForm }),
  editStudent: t => openSheet({ type: "studentForm", form: true, id: t.dataset.id }),
  newEnroll: t => openSheet({ type: "enrollForm", form: true, studentId: t.dataset.id, onDraw: initEnrollForm }),
  editEnroll: t => openSheet({ type: "enrollForm", form: true, id: t.dataset.id, onDraw: initEnrollForm }),
  toggleHist(t){ const a = UI.sheet.all ||= {}; a[t.dataset.id] = !a[t.dataset.id]; drawSheet(); },
  ptab(t){ UI.sheet.ptab = t.dataset.t; drawSheet(); },
  askDelPay(t){ UI.sheet.confirmDel = t.dataset.id; drawSheet(); },
  async delPay(t){ if (await remove("payments", t.dataset.id)){ toast("Ödeme silindi."); UI.sheet.confirmDel = null; drawSheet(); } },
};

export const changes = { enrRecalc: recalc };
export const inputs = {
  enrRecalc(el){ if (el.id === "f_rate") delete el.dataset.auto; recalc(); },
  amtInput(el){ delete el.dataset.auto; },
  teacherInput(el){
    const wrap = $("#shareWrap"), share = $("#f_share"); const name = el.value.trim();
    wrap.hidden = isOwner(name);
    const t = D.teachers().find(x => lower(x.name) === lower(name));
    if (t && (!share.value || share.dataset.auto)){ share.value = t.share || ""; share.dataset.auto = "1"; }
  },
};

export const submits = {
  async stForm(f, err){
    const sh = UI.sheet;
    const name = $("#f_name").value.trim().replace(/\s+/g, " ");
    const phone = $("#f_phone").value.trim();
    const startDate = $("#f_start").value;
    if (name.length < 2) return err("Öğrencinin adını yaz.");
    if (phoneError(phone)) return err(phoneError(phone));
    if (!isDate(startDate)) return err("Başlangıç tarihini seç.");
    const person = { name, parentName: $("#f_parent").value.trim(), phone, startDate, notes: $("#f_notes").value.trim() };

    if (sh.id){
      const old = S.students[sh.id]; const active = $("#f_active").checked;
      if (await save("students", sh.id, { ...person, active })){
        toast(old.active !== false && !active ? `${name} pasife alındı. Geçmiş kayıtları korunuyor.` : "Öğrenci güncellendi.");
        openSheet({ type: "profile", id: sh.id });
      }
      return;
    }

    const enr = readEnroll(); if (enr.error) return err(enr.error);
    // Aynı kişiyi ikinci kez açmayı önle: asıl sorun buydu (bir kişi = bir profil, birden çok ders).
    const same = Object.values(S.students).find(s => lower(s.name) === lower(name));
    if (same && !sh.dupOk){
      sh.dupOk = true;
      return err(`“${same.name}” adında bir öğrenci zaten var${same.active === false ? " (pasif)" : ""}. Aynı kişiyse bunu kapatıp onun profilinden “+ Ders ekle”yi kullan. Farklı biriyse tekrar Kaydet'e bas.`);
    }
    const classId = await ensureClass(enr.classId, name); if (!classId) return;
    const sid = uid("s"), eid = uid("e");
    if (!(await save("students", sid, { ...person, active: true }))) return;
    if (!(await save("enrollments", eid, { ...enr, classId, studentId: sid, startDate, active: true }))) return err("Öğrenci kaydedildi ama ders kaydı yapılamadı. Profilinden “+ Ders ekle” ile tekrar dene.");
    toast(`${name} eklendi.`);
    openSheet({ type: "profile", id: sid });
  },

  async enrForm(f, err){
    const sh = UI.sheet; const old = sh.id ? S.enrollments[sh.id] : null;
    const studentId = old ? old.studentId : sh.studentId; const st = S.students[studentId];
    const enr = readEnroll(); if (enr.error) return err(enr.error);
    const startDate = $("#f_estart").value; if (!isDate(startDate)) return err("Başlangıç tarihini seç.");
    const dup = Object.values(S.enrollments).find(e => e.studentId === studentId && e.classId === enr.classId && e.active !== false && e.id !== sh.id);
    if (dup) return err(`${st.name} bu derse zaten kayıtlı.`);
    const classId = await ensureClass(enr.classId, st.name); if (!classId) return;
    const id = sh.id || uid("e");
    const active = old ? $("#f_eactive").checked : true;
    if (await save("enrollments", id, { ...enr, classId, studentId, startDate, active })){
      toast(old ? (old.active !== false && !active ? "Ders kaydı kapatıldı. Geçmişi korunuyor." : "Ders kaydı güncellendi.") : "Ders eklendi.");
      openSheet({ type: "profile", id: studentId });
    }
  },
};
