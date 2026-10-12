// Defterler: kursun sattığı ürünlerin (ör. kelime defteri) stok ve satış takibi.
// Üstte her ürün için özet kartı (kalan / satılan, tahsil edilen / ödenmemiş); altında satışlar:
// önce ödemeyenler (tek dokunuşla "Ödendi"), sonra ödeyenler. Satış ve ürün formları sağdan / alttan açılan panelde.
import { S, D, UI, save, remove, strip, toast, openSheet, closeSheet, drawSheet } from "../app.js";
import { esc, TL, uid, lower } from "../lib/format.js";
import { fmtDate, isDate } from "../lib/dates.js";
import { empty, shHead, avatar } from "../ui.js";

const $ = s => document.querySelector(s);
const products = () => Object.values(S.products || {}).filter(p => p.active !== false).sort((a, b) => a.name.localeCompare(b.name, "tr"));
const clsOf = sid => D.enrollmentsOf(sid)[0]?.classId;

// ---------- sayfa ----------
function productCard(p, many){
  const st = D.productStats(p.id);
  const pct = st.stock ? Math.round(st.sold / st.stock * 100) : 0;
  return `<section class="card prodcard">
    <div class="ps-top"><span class="ps-l">${esc(p.name)} · ${Number(p.price) ? `birim ${TL(p.price)}` : `<span class="late-t">birim fiyat girilmedi</span>`}</span>
      <button class="btn sm ghost" data-act="productEdit" data-id="${p.id}">Düzenle</button></div>
    <div class="pc-stock"><b class="num">${st.left}</b><span>/ ${st.stock} kaldı</span></div>
    <div class="db-bar tc-bar" aria-label="Satılan ${st.sold}, kalan ${st.left}"><i style="width:${pct}%"></i></div>
    <div class="nc-grid">
      <div><small>Satılan</small><b class="num">${st.sold} adet</b><span>${st.buyers} öğrenci</span></div>
      <div><small>Tahsil edilen</small><b class="num">${TL(st.paid)}</b><span>toplam ${TL(st.total)}</span></div>
    </div>
    ${st.unpaid ? `<p class="ps-cut"><span class="late-t">${TL(st.unpaid)} ödenmedi · ${st.unpaidCount} kişi</span></p>` : st.sold ? `<p class="ps-cut">Satılanların hepsi ödendi.</p>` : ""}
    ${st.left < 0 ? `<p class="ps-cut late-t">Satılan adet stoktan fazla görünüyor; stok adedini düzelt.</p>` : ""}
    ${many ? `<div class="toolbar"><button class="btn pri" data-act="saleNew" data-p="${p.id}">+ ${esc(p.name)} sat</button></div>` : ""}
  </section>`;
}

function saleRow(s, many){
  const st = S.students[s.studentId], p = S.products[s.productId];
  return `<div class="prow">${avatar(st?.name)}
    <div class="pmain"><button class="link name" data-act="saleEdit" data-id="${s.id}">${esc(st?.name || "Silinmiş öğrenci")}</button>
      <span class="sub">${many ? `${esc(p?.name || "")} · ` : ""}${s.qty} adet × ${TL(s.unitPrice)} · ${fmtDate(s.date)}${s.note ? ` · ${esc(s.note)}` : ""}</span>
      ${s.paid ? `<span class="sub">Ödendi${s.paidDate ? ` · ${fmtDate(s.paidDate)}` : ""}</span>` : ""}</div>
    <div class="pside"><span class="amt num">${TL(D.saleTotal(s))}</span>
      ${s.paid ? `<button class="btn xs on" data-act="salePaid" data-id="${s.id}" aria-pressed="true" title="Ödenmedi olarak geri al">✓ Ödendi</button>`
        : `<button class="tbtn" data-act="salePaid" data-id="${s.id}">Ödendi</button>`}</div></div>`;
}

export function vNotebooks(){
  const ps = products();
  if (!ps.length) return `<div class="stack">
    <div class="sec-head"><h2>Defterler</h2></div>
    <div class="panel stack">${empty("Henüz ürün yok. Elindeki defterleri ekleyerek başla: adı, kaç adet olduğu ve birim fiyatı.")}
      <div><button class="btn pri" data-act="productNew">+ Ürün ekle</button></div></div></div>`;
  const q = lower(S.saleQ.trim()), many = ps.length > 1;
  const all = D.salesOf().filter(s => S.products[s.productId]);
  const rows = all.filter(s => (!q || lower(S.students[s.studentId]?.name).includes(q)) && (!S.saleState || (S.saleState === "odendi") === !!s.paid));
  const groups = [[false, "Ödemeyenler", "gecikti"], [true, "Ödeyenler", "odendi"]].map(([paid, label, cls]) => {
    const g = rows.filter(s => !!s.paid === paid);
    return g.length ? `<section class="pgroup ${cls}"><h3 class="pg-h">${label} <span class="num">${g.length}</span></h3>
      <div class="panel"><div class="plist">${g.map(s => saleRow(s, many)).join("")}</div></div></section>` : "";
  }).join("");
  return `<div class="stack">
    <div class="sec-head"><h2>Defterler</h2><div class="toolbar"><button class="btn sm ghost" data-act="productNew">+ Ürün</button>
      <button class="btn pri" data-act="saleNew" data-p="${ps[0].id}">+ Satış ekle</button></div></div>
    ${ps.map(p => productCard(p, many)).join("")}
    ${all.length ? `<div class="filters">
      <input type="search" id="saleq" data-input="saleQ" placeholder="Öğrenci ara" value="${esc(S.saleQ)}" aria-label="Öğrenci ara" autocomplete="off">
      <select id="salest" data-change="saleState" aria-label="Ödeme durumu">
        <option value="">Hepsi</option><option value="odenmedi" ${S.saleState === "odenmedi" ? "selected" : ""}>Ödemeyenler</option>
        <option value="odendi" ${S.saleState === "odendi" ? "selected" : ""}>Ödeyenler</option></select></div>
    ${rows.length ? groups : `<div class="panel">${empty("Bu filtreyle satış yok.")}</div>`}`
    : `<div class="panel">${empty("Henüz satış yok. “+ Satış ekle” ile kim aldı, kaç adet ve ödedi mi gir.")}</div>`}
  </div>`;
}

// ---------- satış formu ----------
function shSale(){
  const sh = UI.sheet, d = sh.id ? S.sales[sh.id] : null;
  const pid = d?.productId || sh.productId, p = S.products[pid]; if (!p) return null;
  const st = D.productStats(pid), left = st.left + (d ? Number(d.qty) || 0 : 0);
  const students = D.activeStudents();
  const sel = d?.studentId || sh.studentId || "";
  const qty = d?.qty || 1, price = d ? d.unitPrice : p.price, paid = d ? !!d.paid : true;
  return `${shHead(d ? "Satışı düzenle" : "Defter satışı")}
    <form id="saleForm" class="stack" novalidate>
      <div class="toolbar"><span class="chip cls-lila">${esc(p.name)}</span><span class="hint">Stokta ${left} adet var</span></div>
      <label class="f">Öğrenci<select id="s_st"><option value="">Seç</option>${students.map(s => {
        const c = clsOf(s.id); return `<option value="${s.id}" ${s.id === sel ? "selected" : ""}>${esc(s.name)}${c ? ` · ${esc(D.clsName(c))}` : ""}</option>`; }).join("")}</select></label>
      <div class="fgrid">
        <label class="f">Adet<input id="s_qty" type="number" min="1" step="1" inputmode="numeric" data-input="saleCalc" value="${qty}"></label>
        <label class="f">Birim fiyat (TL)<input id="s_price" type="number" min="0" inputmode="numeric" data-input="saleCalc" value="${price}"></label>
        <label class="f">Tarih<input id="s_date" type="date" value="${d?.date || D.today()}"></label>
      </div>
      <div class="f"><span class="flabel">Ödeme</span><div class="seg">
        <label><input type="radio" name="s_paid" value="1" ${paid ? "checked" : ""}>Ödedi</label>
        <label><input type="radio" name="s_paid" value="0" ${paid ? "" : "checked"}>Sonra ödeyecek</label></div></div>
      <label class="f">Not (isteğe bağlı)<input id="s_note" value="${esc(d?.note || "")}" placeholder="ör. veli ders sonunda getirecek"></label>
      <div class="hint">Toplam: <strong class="num" id="s_total">${TL(qty * price)}</strong></div>
      <div id="formErr" class="err" role="alert"></div>
      <div class="toolbar"><button class="btn pri" type="submit">${d ? "Kaydet" : "Satışı kaydet"}</button><button class="btn" type="button" data-act="close">Vazgeç</button>
        ${d ? (sh.confirmDel ? `<span class="confirm">Silinsin mi? <button class="btn xs danger" type="button" data-act="saleDel" data-id="${d.id}">Evet, sil</button></span>`
          : `<button class="btn ghost danger" type="button" data-act="saleAskDel">Sil</button>`) : ""}</div>
    </form>`;
}

// ---------- ürün formu ----------
function shProduct(){
  const d = UI.sheet.id ? S.products[UI.sheet.id] : null;
  const sold = d ? D.productStats(d.id).sold : 0;
  return `${shHead(d ? "Ürünü düzenle" : "Yeni ürün")}
    <form id="productForm" class="stack" novalidate>
      <label class="f">Ürün adı<input id="pr_name" value="${esc(d?.name ?? "Kelime defteri")}"></label>
      <div class="fgrid">
        <label class="f">Toplam adet (elimizde olan)<input id="pr_stock" type="number" min="0" step="1" inputmode="numeric" value="${d?.stock ?? 100}"></label>
        <label class="f">Birim fiyat (TL)<input id="pr_price" type="number" min="0" inputmode="numeric" value="${d?.price ?? ""}" placeholder="ör. 250"></label>
      </div>
      ${d ? `<p class="hint" style="margin:0">Şu ana kadar ${sold} adet satıldı. Yeni defter gelirse toplam adedi artır; fiyat değişikliği eski satışları etkilemez.</p>` : ""}
      <div id="formErr" class="err" role="alert"></div>
      <div class="toolbar"><button class="btn pri" type="submit">Kaydet</button><button class="btn" type="button" data-act="close">Vazgeç</button></div>
    </form>`;
}

export const views = { defterler: vNotebooks };
export const sheets = { sale: shSale, product: shProduct };
export const actions = {
  saleNew: t => {
    const pid = t.dataset.p || products()[0]?.id;
    if (!pid) return openSheet({ type: "product", form: true });
    openSheet({ type: "sale", form: true, productId: pid, studentId: t.dataset.st || "" });
  },
  saleEdit: t => openSheet({ type: "sale", form: true, id: t.dataset.id }),
  saleAskDel(){ UI.sheet.confirmDel = true; drawSheet(); },
  async saleDel(t){ if (await remove("sales", t.dataset.id)){ toast("Satış silindi."); closeSheet(); } },
  async salePaid(t){
    const s = S.sales[t.dataset.id]; if (!s) return;
    const paid = !s.paid;
    if (await save("sales", s.id, { ...strip(s), paid, paidDate: paid ? D.today() : null }))
      toast(paid ? `${S.students[s.studentId]?.name || "Öğrenci"}: ${TL(D.saleTotal(s))} ödendi.` : "Ödenmedi olarak geri alındı.");
  },
  productNew: () => openSheet({ type: "product", form: true }),
  productEdit: t => openSheet({ type: "product", form: true, id: t.dataset.id }),
  goNotebooks(){ S.tab = "defterler"; S.saleState = "odenmedi"; S.saleQ = ""; try { localStorage.setItem("kw_tab", S.tab); } catch {} window.scrollTo(0, 0); },
};
export const inputs = {
  saleQ(el){ S.saleQ = el.value; return true; },
  saleCalc(){ const q = Number($("#s_qty")?.value) || 0, p = Number($("#s_price")?.value) || 0; const o = $("#s_total"); if (o) o.textContent = TL(q * p); },
};
export const changes = { saleState(el){ S.saleState = el.value; return true; } };
export const submits = {
  async saleForm(f, err){
    const sh = UI.sheet, d = sh.id ? S.sales[sh.id] : null, pid = d?.productId || sh.productId;
    const studentId = $("#s_st").value; if (!studentId) return err("Öğrenciyi seç.");
    const qty = Number($("#s_qty").value); if (!(qty >= 1) || !Number.isInteger(qty)) return err("Adedi yaz (1 ya da daha fazla).");
    const unitPrice = Number($("#s_price").value); if (!(unitPrice >= 0) || $("#s_price").value === "") return err("Birim fiyatı yaz.");
    const date = $("#s_date").value; if (!isDate(date)) return err("Tarihi seç.");
    const left = D.productStats(pid).left + (d ? Number(d.qty) || 0 : 0);
    if (qty > left) return err(`Stokta ${left} defter var. Daha fazla geldiyse önce ürünü düzenleyip toplam adedi artır.`);
    const paid = document.querySelector("input[name=s_paid]:checked")?.value === "1";
    const rec = { productId: pid, studentId, date, qty, unitPrice, paid,
      paidDate: paid ? (d?.paid && d.paidDate ? d.paidDate : date) : null, note: $("#s_note").value.trim() };
    if (await save("sales", d?.id || uid("sl"), rec)){
      toast(`${S.students[studentId]?.name}: ${qty} adet · ${TL(qty * unitPrice)}${paid ? " ödendi" : " · ödeme bekleniyor"}.`);
      closeSheet();
    }
  },
  async productForm(f, err){
    const d = UI.sheet.id ? S.products[UI.sheet.id] : null;
    const name = $("#pr_name").value.trim(); if (!name) return err("Ürün adını yaz.");
    const stock = Number($("#pr_stock").value); if (!(stock >= 0) || !Number.isInteger(stock)) return err("Toplam adedi yaz.");
    const price = Number($("#pr_price").value); if ($("#pr_price").value === "" || !(price >= 0)) return err("Birim fiyatı yaz.");
    if (d && stock < D.productStats(d.id).sold) return err(`Şu ana kadar ${D.productStats(d.id).sold} adet satıldı; toplam adet bundan az olamaz.`);
    if (await save("products", d?.id || uid("pr"), { ...(d ? strip(d) : {}), name, stock, price, active: true })){
      toast(`${name} kaydedildi.`); closeSheet();
    }
  },
};
