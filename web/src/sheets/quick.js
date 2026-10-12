// Hızlı işlemler:
//   quick  — tek "+" menüsü: ödeme al, not yaz, telafi / ekstra, yeni öğrenci, yeni grup, hatırlatma hazırla.
//   remind — ödemesi geciken velilere hazır WhatsApp mesajı (kopyala ya da telefon kayıtlıysa WhatsApp'ta aç).
//   tpay   — bir hocanın gönderilmemiş paylarını tek seferde "gönderildi" işaretle.
import { S, D, UI, save, strip, toast, openSheet, closeSheet } from "../app.js";
import { esc, TL } from "../lib/format.js";
import { fmtDate, daysBetween } from "../lib/dates.js";
import { shHead, empty, avatar } from "../ui.js";

const $ = s => document.querySelector(s);
const OWNER_SIGN = "Kevser Durmuş · English with Kawthar";

// ---------- hatırlatma mesajı ----------
// Geciken ödemeler kişi kişi (bir kişinin birden çok dersi / dönemi tek mesajda).
export function lateByStudent(){
  const map = new Map();
  for (const x of D.pendingDues(0)){
    if (x.d.level !== "late") continue;
    if (!map.has(x.st.id)) map.set(x.st.id, { st: x.st, items: [] });
    map.get(x.st.id).items.push(x);
  }
  return [...map.values()].sort((a, b) => a.items[0].d.dueDate.localeCompare(b.items[0].d.dueDate));
}
export function reminderText({ st, items }){
  // "Ali için Ekim 2026 (Butterfly, 8.000 TL) ders ücreti henüz bize ulaşmadı."
  const what = items.map(({ e, d }) => `${d.periodLabel}${d.paid ? " kalanı" : ""} (${D.clsName(e.classId)}, ${TL(d.amount)})`);
  const list = what.length > 1 ? `${what.slice(0, -1).join(", ")} ve ${what[what.length - 1]}` : what[0];
  const total = items.reduce((a, x) => a + x.d.amount, 0);
  const hello = st.parentName ? `Merhaba ${st.parentName},` : "Merhaba,";
  return `${hello} ${st.name} için ${list} ders ücreti henüz bize ulaşmadı.`
    + (items.length > 1 ? ` Toplam ${TL(total)}.` : "")
    + ` Uygun olduğunuzda gönderebilirseniz çok seviniriz. İyi günler dileriz.\n${OWNER_SIGN}`;
}
// Türkiye numarası -> WhatsApp biçimi (90…); anlaşılamazsa boş.
function waNumber(phone){
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "90" + d.slice(1);
  if (d.length === 10 && d.startsWith("5")) d = "90" + d;
  return /^90\d{10}$/.test(d) ? d : "";
}

function shRemind(){
  const list = lateByStudent();
  return `${shHead("Hatırlatma mesajları")}
    <p class="hint" style="margin:0">Ödemesi geciken ${list.length} kişi. Mesajı kopyalayıp WhatsApp'ta veliye yapıştır; telefon kayıtlıysa doğrudan WhatsApp'ta açılır. Mesajı göndermeden önce değiştirebilirsin.</p>
    ${list.length ? list.map((g, i) => {
      const wa = waNumber(g.st.phone);
      const total = g.items.reduce((a, x) => a + x.d.amount, 0);
      const late = daysBetween(g.items[0].d.dueDate, D.today());
      return `<section class="panel remind">
        <div class="rm-h">${avatar(g.st.name, g.items[0].e.classId)}
          <span class="rm-n"><b>${esc(g.st.name)}</b><small>${late} gün gecikti${g.st.parentName ? ` · Veli: ${esc(g.st.parentName)}` : ""}</small></span>
          <b class="num">${TL(total)}</b></div>
        <textarea id="msg_${i}" rows="5" aria-label="${esc(g.st.name)} için hatırlatma mesajı">${esc(reminderText(g))}</textarea>
        <div class="toolbar">
          <button class="btn sm pri" data-act="copyMsg" data-i="${i}"><svg class="ico"><use href="#i-copy"/></svg>Kopyala</button>
          ${wa ? `<button class="btn sm" data-act="waOpen" data-i="${i}" data-wa="${wa}"><svg class="ico"><use href="#i-msg"/></svg>WhatsApp'ta aç</button>`
            : `<span class="hint">Telefon kayıtlı değil</span>`}
        </div></section>`;
    }).join("") : `<div class="panel">${empty("Geciken ödeme yok. Hatırlatılacak kimse kalmadı.")}</div>`}`;
}

// ---------- hızlı ekle ----------
// Renk kuralı: en sık iş (ödeme al) mor, diğerleri sade beyaz kart.
const QUICK = [
  { act: `data-act="payPick"`, icon: "i-wallet", tone: "t-violet", label: "Ödeme al", note: "Veliden gelen ödeme" },
  { act: `data-act="quickNote"`, icon: "i-note", tone: "t-plain", label: "Not yaz", note: "Arama, hatırlatma, fikir" },
  { act: `data-act="newExtra"`, icon: "i-cal", tone: "t-plain", label: "Telafi / ekstra", note: "Tek seferlik ders" },
  { act: `data-act="newStudent"`, icon: "i-userplus", tone: "t-plain", label: "Yeni öğrenci", note: "Kayıt ve ders" },
  { act: `data-act="remind"`, icon: "i-msg", tone: "t-plain", label: "Hatırlatma", note: "Geciken velilere mesaj" },
  { act: `data-act="newClass"`, icon: "i-book", tone: "t-plain", label: "Yeni grup / ders", note: "Haftalık programa" },
];
function shQuick(){
  return `${shHead("Ne eklemek istiyorsun?")}
    <div class="qgrid">${QUICK.map(q => `<button class="qtile ${q.tone}" ${q.act}>
      <span class="q-ic" aria-hidden="true"><svg class="ico"><use href="#${q.icon}"/></svg></span>
      <b>${q.label}</b><small>${q.note}</small></button>`).join("")}</div>`;
}

// ---------- hocaya ödeme ----------
export const unpaidCuts = name => Object.values(S.payments)
  .filter(p => p.teacher === name && Number(p.teacherCut) > 0 && !p.teacherPaid)
  .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
function shTpay(){
  const name = UI.sheet.teacher, ps = unpaidCuts(name);
  const total = ps.reduce((a, p) => a + Number(p.teacherCut), 0);
  return `${shHead(esc(name))}
    ${ps.length ? `<section class="panel stack" style="gap:10px">
      <div class="sumrow total" style="padding-top:0"><span>Gönderilecek toplam</span><b class="num">${TL(total)}</b></div>
      <div class="list">${ps.map(p => `<div class="row static">${avatar(S.students[p.studentId]?.name, S.enrollments[p.enrollmentId]?.classId, "sm")}
        <span class="main"><span class="name">${esc(S.students[p.studentId]?.name || "–")}</span><span class="sub">${esc(p.label || "")} · veliden ${TL(p.amount)} · ${fmtDate(p.date)}</span></span>
        <span class="side"><b class="num">${TL(p.teacherCut)}</b></span></div>`).join("")}</div>
      <p class="hint" style="margin:0">Parayı gönderdiysen hepsini tek seferde işaretle. Tek tek işaretlemek için Ödemeler ya da Hocalar sayfasını kullan.</p>
      <div class="toolbar"><button class="btn pri" data-act="tpayDone"><svg class="ico"><use href="#i-check"/></svg>Hepsini gönderildi işaretle</button>
        <button class="btn" data-act="close">Vazgeç</button></div>
    </section>` : `<div class="panel">${empty("Bu hocaya gönderilmemiş pay yok.")}</div>`}`;
}

export const sheets = { quick: shQuick, remind: shRemind, tpay: shTpay };

async function copyText(text){
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}
export const actions = {
  quick: () => openSheet({ type: "quick" }),
  remind: () => openSheet({ type: "remind", form: true }),   // form: yazılan mesaj veri değişince silinmesin
  tpay: t => openSheet({ type: "tpay", teacher: t.dataset.t }),
  quickNote(){
    closeSheet(); S.tab = "notlar";
    try { localStorage.setItem("kw_tab", S.tab); } catch {}
    setTimeout(() => $("#n_text")?.focus(), 50);
  },
  async copyMsg(t){
    const ta = $(`#msg_${t.dataset.i}`); if (!ta) return;
    if (!(await copyText(ta.value))){ ta.focus(); ta.select(); try { document.execCommand("copy"); } catch {} }
    t.innerHTML = `<svg class="ico"><use href="#i-check"/></svg>Kopyalandı`;
    toast("Mesaj kopyalandı. WhatsApp'ta veliye yapıştırabilirsin.");
  },
  waOpen(t){
    const ta = $(`#msg_${t.dataset.i}`); if (!ta) return;
    window.open(`https://wa.me/${t.dataset.wa}?text=${encodeURIComponent(ta.value)}`, "_blank", "noopener");
  },
  async tpayDone(){
    const name = UI.sheet.teacher, ps = unpaidCuts(name), today = D.today();
    let n = 0;
    for (const p of ps) if (await save("payments", p.id, { ...strip(p), teacherPaid: true, teacherPaidDate: today })) n++;
    if (n){ toast(`${name}: ${n} ödemenin payı gönderildi olarak işaretlendi.`); closeSheet(); }
  },
};
