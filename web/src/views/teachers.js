// Hocalar: her ödemede oluşan hoca payı ve hocaya gönderilip gönderilmediği.
// Düzen: üstte Kevser Hanım'ın net kazancı (mor defter kartı); altında hocalar 2 sütunlu, aynı satırdaki kartlar eşit boyda.
import { S, D } from "../app.js";
import { esc, TL } from "../lib/format.js";
import { fmtDate, monthLabel } from "../lib/dates.js";
import { chip, empty, avatar } from "../ui.js";
import { OWNER } from "../domain.js";
import { monthNet, teacherShares } from "./payments.js";

// Derse göre gruplu öğrenci listesi: "Tiny Stars · Ali, Can"
function classLines(enrs){
  const by = new Map();
  enrs.forEach(e => { if (!by.has(e.classId)) by.set(e.classId, []); by.get(e.classId).push(S.students[e.studentId]?.name || ""); });
  return [...by.entries()].sort((a, b) => D.clsName(a[0]).localeCompare(D.clsName(b[0]), "tr"))
    .map(([cid, ns]) => `<div class="t-cls">${chip(cid)}<span>${esc(ns.sort((a, b) => a.localeCompare(b, "tr")).join(", "))}</span></div>`).join("");
}

// Kevser Hanım: kendi verdiği dersler ve o ay ona kalan net tutar.
function ownerCard(monthPays){
  const enrs = D.activeEnrollments().filter(e => !e.teacher);
  const classes = [...new Set(enrs.map(e => e.classId))].sort((a, b) => D.clsName(a).localeCompare(D.clsName(b), "tr"));
  const students = new Set(enrs.map(e => e.studentId)).size;
  const own = monthPays.filter(p => !p.teacher).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const fromOthers = monthPays.filter(p => p.teacher).reduce((a, p) => a + (Number(p.amount) || 0) - (Number(p.teacherCut) || 0), 0);
  const net = monthNet(S.month);   // ayın tüm ödemeleri yapılıp tüm hoca payları verilince kalan
  return `<section class="hero owner-hero">
    <div class="hero-top"><span class="hero-l">${monthLabel(S.month)} · ${OWNER}'a kalan (net)</span><span class="hero-w">kurs sahibi</span></div>
    <p class="hero-t num">${TL(own + fromOthers)}</p>
    <div class="oh-chips"><span>Kendi dersleri <b class="num">${TL(own)}</b></span><span>Hocaların derslerinden <b class="num">${TL(fromOthers)}</b></span>
      ${net.all ? `<span class="oh-all">Hepsi ödenince <b class="num">${TL(net.netAll)}</b></span>` : ""}</div>
    <p class="hero-s">${students} öğrenci · ${classes.length} ders</p>
    <div class="sub chips">${classes.map(chip).join("")}</div>
  </section>`;
}

// Hoca kartı: rozet + dersleri, bu ayın payı ve ne kadarının gönderildiği (çubuk), tek dokunuşla "Gönderdim".
// Bu ay hocalara gidecek toplam pay, hoca hoca (gönderildi / gönderilecek / veliden bekleniyor).
function sharesCard(shares){
  const list = Object.entries(shares).filter(([, v]) => v.total || v.older).sort((a, b) => b[1].total - a[1].total);
  if (!list.length) return "";
  const sum = k => list.reduce((a, [, v]) => a + v[k], 0);
  return `<section class="card shcard">
    <div class="ps-top"><span class="ps-l">${monthLabel(S.month)} · hocalara gidecek pay (hepsi ödenince)</span></div>
    <b class="ps-v num">${TL(sum("total"))}</b>
    <div class="sh-leg"><span><i class="s1"></i>Gönderildi ${TL(sum("sent"))}</span><span><i class="s2"></i>Gönderilecek ${TL(sum("toSend"))}</span><span><i class="s3"></i>Veliden bekleniyor ${TL(sum("waiting"))}</span></div>
    <div class="sh-rows">${list.map(([n, v]) => `<div class="sh-row">${avatar(n, null, "sm")}<span class="sh-n">${esc(n)}</span>
      <span class="sbar" aria-hidden="true">${["sent", "toSend", "waiting"].map((k, i) => `<i class="s${i + 1}" style="width:${v.total ? (v[k] / v.total * 100).toFixed(1) : 0}%"></i>`).join("")}</span>
      <b class="num">${TL(v.total)}</b></div>`).join("")}</div>
    ${sum("older") ? `<p class="hint" style="margin:6px 0 0">Ayrıca önceki aylardan veliden alınmış ama hocaya gönderilmemiş ${TL(sum("older"))} var (${list.filter(([, v]) => v.older).map(([n, v]) => `${esc(n)} ${TL(v.older)}`).join(", ")}).</p>` : ""}
  </section>`;
}

function teacherCard(t, monthPays, shares){
  const ps = monthPays.filter(p => p.teacher === t.name).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const enrs = D.activeEnrollments().filter(e => e.teacher === t.name);
  const sh = shares[t.name] || { sent: 0, toSend: 0, waiting: 0, waitingNames: [], older: 0, total: 0 };
  const w = v => sh.total ? `${(v / sh.total * 100).toFixed(1)}%` : "0";
  const owe = sh.toSend + sh.older;   // veliden alınmış, hocaya gönderilecek (önceki aylar dahil)
  return `<section class="panel tcard">
    <div class="tc-head">${avatar(t.name)}<span class="tc-n"><b>${esc(t.name)}</b><small>${enrs.length} öğrenci${t.share ? ` · varsayılan pay ${TL(t.share)}` : ""}</small></span></div>
    <div class="t-classes">${enrs.length ? classLines(enrs) : `<span class="hint">Aktif öğrencisi yok.</span>`}</div>
    <div class="tc-pay">
      <div class="tc-row"><span>${monthLabel(S.month)} payı <small class="hint">(hepsi ödenince)</small></span><b class="num">${TL(sh.total)}</b></div>
      ${sh.total ? `<div class="sbar" aria-hidden="true"><i class="s1" style="width:${w(sh.sent)}"></i><i class="s2" style="width:${w(sh.toSend)}"></i><i class="s3" style="width:${w(sh.waiting)}"></i></div>
      <ul class="tc-l">
        ${sh.sent ? `<li><i class="s1"></i>Gönderildi<b class="num">${TL(sh.sent)}</b></li>` : ""}
        ${sh.toSend ? `<li><i class="s2"></i>Veliden alındı, hocaya gönderilecek<b class="num">${TL(sh.toSend)}</b></li>` : ""}
        ${sh.waiting ? `<li><i class="s3"></i>Veliden bekleniyor <small>(${esc([...new Set(sh.waitingNames)].join(", "))})</small><b class="num">${TL(sh.waiting)}</b></li>` : ""}
      </ul>` : `<span class="hint">Bu ay pay yok${enrs.some(e => !Number(e.teacherShare)) ? " (hoca payı girilmemiş kayıt var)" : ""}</span>`}
      ${sh.older ? `<div class="tc-old">Önceki aylardan gönderilmemiş: <b class="num">${TL(sh.older)}</b></div>` : ""}
      ${owe > 0 ? `<div class="tc-row"><span class="late-t">Şimdi gönderilecek: ${TL(owe)}</span><button class="tbtn ghost" data-act="tpay" data-t="${esc(t.name)}">Gönderdim</button></div>` : ""}
    </div>
    ${ps.length ? `<details class="tc-det"><summary>${monthLabel(S.month)} ödemeleri (${ps.length})</summary><div class="list">${ps.map(p => `<div class="row static">
        <span class="main"><span class="name">${esc(S.students[p.studentId]?.name || "–")}</span><span class="sub num">${fmtDate(p.date)} · veliden ${TL(p.amount)}${p.teacherPaid && p.teacherPaidDate ? ` · hocaya ${fmtDate(p.teacherPaidDate)}` : ""}</span></span>
        <span class="side"><span class="amt num">${TL(p.teacherCut)}</span>
        <button class="btn xs ${p.teacherPaid ? "on" : ""}" data-act="tpaid" data-id="${p.id}" aria-pressed="${!!p.teacherPaid}">${p.teacherPaid ? "✓ Gönderildi" : "Gönderilmedi"}</button></span></div>`).join("")}</div></details>` : ""}
  </section>`;
}

export function vTeachers(){
  const teachers = D.teachers();
  const months = [...new Set([D.today().slice(0, 7), S.month, ...Object.values(S.payments).map(p => D.paymentMonth(p)).filter(Boolean)])].sort().reverse();
  const monthPays = Object.values(S.payments).filter(p => D.paymentMonth(p) === S.month);   // o aya ait ödemeler
  const shares = teacherShares(S.month);
  return `<div class="stack">
    <div class="sec-head"><h2>Hocalar ve dersler</h2><select id="tmonth" data-change="payMonth" style="width:auto" aria-label="Ay">${months.map(k => `<option value="${k}" ${k === S.month ? "selected" : ""}>${monthLabel(k)}</option>`).join("")}</select></div>
    <p class="hint" style="margin:0">Veliden alınan her ödemede hocanın payı otomatik oluşur. Hocaya parasını gönderince “Gönderdim”e dokun.</p>
    ${ownerCard(monthPays)}
    ${sharesCard(shares)}
    ${teachers.length ? `<div class="tgrid">${teachers.map(t => teacherCard(t, monthPays.filter(p => p.teacher), shares)).join("")}</div>`
      : `<div class="panel">${empty("Başka hoca yok. Ayarlar'dan hoca ekleyebilir ya da öğrencinin ders kaydında “Öğretmen” alanını doldurabilirsin.")}</div>`}
  </div>`;
}

export const views = { hocalar: vTeachers };
