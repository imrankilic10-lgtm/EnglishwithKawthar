// Ödeme alma: öğrenci → ders → tutar → tarih → kaydet. Dönem ve tutar otomatik dolar.
import { S, D, UI, save, toast, openSheet, closeSheet, drawSheet } from "../app.js";
import { esc, TL, fmtH, uid, lower } from "../lib/format.js";
import { fmtDate, monthLabel, monthEnd, isDate, addDays } from "../lib/dates.js";
import { chip, shHead, duePill, empty, packageText } from "../ui.js";

const $ = s => document.querySelector(s);
const payableEnrollments = sid => {
  const all = D.enrollmentsOf(sid, true);
  const on = all.filter(e => e.active !== false);
  return on.length ? on : all;
};

function shPayPick(){
  const list = D.activeStudents();
  return `${shHead("Kimden ödeme alındı?")}
    <input type="search" id="pq" data-input="payPickFilter" placeholder="Öğrenci ara" aria-label="Öğrenci ara" autocomplete="off">
    <div class="panel"><div class="list" id="pickList">${list.length ? list.map(st => { const s = D.studentStatus(st.id);
      return `<button class="row" data-act="pay" data-id="${st.id}" data-name="${esc(lower(st.name))}">
        <span class="main"><span class="name">${esc(st.name)}</span><span class="sub chips">${D.enrollmentsOf(st.id).map(e => chip(e.classId)).join("")}</span></span>
        <span class="side">${s ? duePill(s.r) : ""}</span></button>`; }).join("") : empty("Henüz öğrenci eklenmedi.")}</div>
      <div class="empty" id="pickNone" hidden>Bu isimde öğrenci bulunamadı.</div></div>`;
}

// Seçilebilecek dönemler: ödenmemiş geçmiş dönemler + önümüzdeki birkaç dönem. Ödenmişler kapalı görünür.
function periodOptions(e){
  const out = []; let future = 0; const limit = addDays(D.today(), 7);
  for (const x of D.periods(e)){
    out.push(x);
    if (x.dueDate > limit) future++;
    if (future >= 3 || out.length > 36) break;
  }
  // Çok eski ve ödenmiş dönemleri gösterme.
  const firstOpen = out.findIndex(x => !x.done);
  return out.slice(Math.max(0, firstOpen - 1));
}
const periodInfo = (e, period) => { for (const x of D.periods(e)){ if (x.period === period) return x; if (x.period > period) break; } return null; };
const periodLabel = (mode, period) => mode === "aylik" ? monthLabel(period) : `${fmtDate(period)} haftası`;
// Kısmi ödemede kalanın varsayılan son günü: dönemin son günü (geçtiyse bugün).
const restDefault = (e, period) => { const end = e.pay?.mode === "haftalik" ? addDays(period, 6) : monthEnd(period); return end < D.today() ? D.today() : end; };
const optNote = o => o.done ? " (ödendi)" : o.paid ? ` (${TL(o.amount)} kaldı)` : o.dueDate < D.today() ? " (gecikti)" : "";
const paidHint = o => o?.paid ? `Bu dönem için daha önce <strong class="num">${TL(o.paid)}</strong> alındı · kalan <strong class="num">${TL(o.amount)}</strong>` : "";

function shPayForm(){
  const sh = UI.sheet; const st = S.students[sh.studentId]; if (!st) return null;
  const enrs = payableEnrollments(st.id);
  const e = S.enrollments[sh.enrollmentId] && enrs.some(x => x.id === sh.enrollmentId) ? S.enrollments[sh.enrollmentId] : enrs[0];
  if (!e) return `${shHead("Ödeme al")}<div class="panel">${empty(`${esc(st.name)} için ders kaydı yok. Önce profilinden “+ Ders ekle” ile bir derse kaydet.`)}</div>`;
  const r = D.status(e);
  const mode = r.mode;
  let periodField = "", partField = "", amount = r.amount;
  if (mode === "paket"){
    periodField = `<label class="f">Kaç saatlik ödeme<input id="p_hours" type="number" min="0.5" step="0.5" inputmode="decimal" value="${r.hours}"></label>`;
  } else {
    const opts = periodOptions(e);
    const sel = sh.period && opts.some(o => o.period === sh.period && !o.done) ? sh.period : r.period;
    const so = opts.find(o => o.period === sel);
    amount = so?.amount ?? r.amount;
    periodField = `<label class="f">${mode === "aylik" ? "Hangi ay için" : "Hangi hafta için"}<select id="p_period" data-change="payPeriod">${opts.map(o =>
      `<option value="${o.period}" data-rest="${o.amount}" data-paid="${o.paid}" data-due="${restDefault(e, o.period)}" ${o.period === sel ? "selected" : ""} ${o.done ? "disabled" : ""}>${esc(o.label)}${optNote(o)}</option>`).join("")}</select></label>
      <div class="hint" id="paidHint" ${so?.paid ? "" : "hidden"}>${paidHint(so)}</div>`;
    // Tutar dönemin kalanından azsa sorulur: kalan sonra mı ödenecek, yoksa dönem bu tutarla mı kapanacak?
    partField = `<div class="partbox" id="partBox" hidden>
      <div id="partText"></div>
      <div class="seg col">
        <label><input type="radio" name="p_part" value="rest" data-change="payPart" checked><span class="grow">Kalanı sonra ödenecek</span></label>
        <label><input type="radio" name="p_part" value="close" data-change="payPart"><span class="grow">Bu dönem için bu kadar alınacak (indirim vb.)</span></label>
      </div>
      <label class="f" id="restDueF">Kalanın son günü<input id="p_restdue" type="date" value="${sel ? restDefault(e, sel) : ""}"></label>
    </div>`;
  }
  const cut = D.teacherCut(e, amount);
  return `${shHead("Ödeme al")}
    <div class="toolbar"><button class="link" data-act="profile" data-id="${st.id}"><strong>${esc(st.name)}</strong></button></div>
    <form id="payForm" class="stack" novalidate>
      ${enrs.length > 1 ? `<div class="f"><span class="flabel">Hangi ders için</span><div class="seg col">${enrs.map(x => { const rx = D.status(x);
        return `<label><input type="radio" name="p_enr" value="${x.id}" data-change="payEnr" ${x.id === e.id ? "checked" : ""}>
          <span class="grow">${esc(D.clsName(x.classId))}</span>${x.active === false ? `<span class="pill none">Bıraktı</span>` : duePill(rx)}</label>`; }).join("")}</div></div>`
        : `<div class="toolbar">${chip(e.classId)}<span class="hint">${esc(D.kindLabel(S.classes[e.classId]?.kind))}</span></div>`}
      ${periodField}
      <div class="fgrid">
        <label class="f">Tutar (TL)<input id="p_amt" type="number" min="0" inputmode="numeric" data-input="payAmt" value="${amount}"></label>
        <label class="f">Ödeme tarihi<input id="p_date" type="date" value="${D.today()}"></label>
      </div>
      ${partField}
      ${mode === "paket" ? `<div class="hint num">Paket: ${packageText(r)}</div>` : ""}
      ${e.teacher ? `<div class="hint" id="cutHint">${esc(e.teacher)} payı: <strong class="num">${TL(cut)}</strong> (ödeme kaydedilince hoca payı otomatik oluşur)</div>` : ""}
      <label class="f">Not (isteğe bağlı)<input id="p_note" placeholder="ör. indirim, 5 haftalık ay, eksik ödeme"></label>
      <div id="formErr" class="err" role="alert"></div>
      <div class="toolbar"><button class="btn pri" type="submit">Ödemeyi kaydet</button><button class="btn" type="button" data-act="close">Vazgeç</button></div>
    </form>`;
}

export const sheets = { payPick: shPayPick, payForm: shPayForm };

export const actions = {
  payPick(){ openSheet({ type: "payPick", form: true, onDraw: () => setTimeout(() => $("#pq")?.focus(), 0) }); },
  // data-id = öğrenci, data-e = ders kaydı (isteğe bağlı), data-p = dönem (isteğe bağlı), data-back = işlem bitince profile dön
  pay(t){
    const sid = t.dataset.id;
    const enrollmentId = t.dataset.e || D.studentStatus(sid)?.e?.id || null;
    openSheet({ type: "payForm", form: true, studentId: sid, enrollmentId, period: t.dataset.p || null, back: t.dataset.back ? sid : null });
  },
};

// Tutar ya da dönem değişince: hoca payı, "daha önce alındı" notu ve eksik ödeme kutusu güncellenir (form yeniden çizilmez).
function syncPayForm(){
  const sh = UI.sheet; const e = S.enrollments[sh.enrollmentId] || payableEnrollments(sh.studentId)[0];
  const amt = Number($("#p_amt")?.value) || 0;
  const h = $("#cutHint strong"); if (h && e) h.textContent = TL(D.teacherCut(e, amt));
  const o = $("#p_period")?.selectedOptions[0], box = $("#partBox"); if (!o || !box) return;
  const rest = Number(o.dataset.rest) || 0, paid = Number(o.dataset.paid) || 0;
  $("#paidHint").hidden = !paid;
  if (paid) $("#paidHint").innerHTML = paidHint({ paid, amount: rest });
  box.hidden = !(amt > 0 && amt < rest);
  if (!box.hidden) $("#partText").innerHTML = `Bu dönem için beklenen <strong class="num">${TL(rest)}</strong>, <strong class="num">${TL(rest - amt)}</strong> eksik kalıyor.`;
  $("#restDueF").hidden = document.querySelector("input[name=p_part]:checked")?.value !== "rest";
}

export const changes = {
  payEnr(el){ UI.sheet.enrollmentId = el.value; UI.sheet.period = null; drawSheet(); },
  payPeriod(el){ const o = el.selectedOptions[0]; $("#p_amt").value = o.dataset.rest; $("#p_restdue").value = o.dataset.due; syncPayForm(); },
  payPart: syncPayForm,
};
export const inputs = {
  payPickFilter(el){
    const q = lower(el.value); let n = 0;
    document.querySelectorAll("#pickList .row").forEach(r => { r.hidden = !r.dataset.name.includes(q); if (!r.hidden) n++; });
    $("#pickNone").hidden = n > 0;
  },
  payAmt: syncPayForm,
};

export const submits = {
  async payForm(f, err){
    const sh = UI.sheet; const st = S.students[sh.studentId];
    const eid = document.querySelector("input[name=p_enr]:checked")?.value || sh.enrollmentId || payableEnrollments(st.id)[0]?.id;
    const e = S.enrollments[eid]; if (!e) return err("Ders seç.");
    const r = D.status(e);
    const amount = Number($("#p_amt").value);
    if (!(amount > 0)) return err("Tutarı yaz.");
    const date = $("#p_date").value; if (!isDate(date)) return err("Ödeme tarihini seç.");
    if (date > addDays(D.today(), 1)) return err("Ödeme tarihi ileri bir tarih olamaz.");
    const rec = { studentId: st.id, enrollmentId: e.id, date, amount, note: $("#p_note").value.trim(),
      teacher: e.teacher || "", teacherCut: D.teacherCut(e, amount), teacherPaid: false, mode: r.mode };
    let rest = 0;   // kısmi ödemede kalan tutar
    if (r.mode === "paket"){
      rec.hours = Number($("#p_hours").value);
      if (!(rec.hours > 0)) return err("Kaç saatlik ödeme olduğunu yaz.");
      rec.label = `${fmtH(rec.hours)} saatlik paket`;
    } else {
      rec.period = $("#p_period").value;
      const info = periodInfo(e, rec.period);
      if (!info || info.done) return err("Bu dönem zaten ödenmiş.");
      // Dönemin kalanından az ödendiyse: "kalanı sonra" seçiliyse dönem açık kalır (kısmi), değilse bu tutarla kapanır.
      if (amount < info.amount && document.querySelector("input[name=p_part]:checked")?.value === "rest"){
        const rd = $("#p_restdue").value;
        if (!isDate(rd)) return err("Kalanın son gününü seç.");
        if (rd < date) return err("Kalanın son günü ödeme tarihinden önce olamaz.");
        Object.assign(rec, { partial: true, restDue: rd });
        rest = info.amount - amount;
      }
      rec.label = periodLabel(r.mode, rec.period) + (rec.partial ? " · kısmi" : info.paid ? " · kalan" : "");
    }
    if (await save("payments", uid("p"), rec)){
      toast(rest ? `${st.name}: ${TL(amount)} kaydedildi · ${TL(rest)} kaldı (son gün ${fmtDate(rec.restDue)}).`
        : `${st.name}: ${TL(amount)} kaydedildi · ${rec.label} ödendi.`);
      if (sh.back) openSheet({ type: "profile", id: sh.back }); else closeSheet();
    }
  },
};
