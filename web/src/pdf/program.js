// Haftalık ders programı -> yatay A4 PDF (tek sayfa), doğrudan indirilir.
// Eski Excel/PDF programının beğenilen düzeni korunur: her grup kendi renginde, grup adı kalın + altı çizili,
// öğrenciler alt alta. Sayfa önce ekran dışında HTML olarak kurulur, sonra görüntüye çevrilip PDF'e konur.
// jsPDF + html2canvas sadece bu dosya yüklenince (butona basınca) indirilir.
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { S, D } from "../app.js";
import { esc } from "../lib/format.js";
import { toMin, pad, DAYS, MONTHS, parse } from "../lib/dates.js";

const PAGE_W = 1123, PAGE_H = 794;   // A4 yatay, 96 dpi
// Kağıtta grupları ayırmak için sıcak + soğuk karışık pastel palet (uygulamadaki ders renkleri sadeleştirildi,
// basılı programın beğenilen görünümü korunsun diye PDF kendi paletini kullanır). [zemin, yazı]
const PDF_COLORS = {
  pembe: ["#F3DCE5", "#7A3550"], turuncu: ["#F6E3D3", "#7D4520"], lila: ["#E8E3F2", "#4E4378"],
  mavi: ["#DFE5EF", "#2F4566"], yesil: ["#E2EBDF", "#3D5A40"], sari: ["#F2EAD0", "#6A5520"],
  somon: ["#F4DFD8", "#84402E"], turkuaz: ["#DCEAE7", "#2E5A57"], gri: ["#E9E6E1", "#4A4A52"],
};

function layout(){
  const classes = Object.values(S.classes);
  const items = [];
  for (const c of classes) for (const sl of c.slots || []) items.push({ c, day: Number(sl.day), s: toMin(sl.start), e: toMin(sl.end), sl });
  const days = [1, 2, 3, 4, 5, 6].concat(items.some(i => i.day === 7) ? [7] : []);
  let gs = 24, ge = 0;
  items.forEach(i => { gs = Math.min(gs, Math.floor(i.s / 60)); ge = Math.max(ge, Math.ceil(i.e / 60)); });
  if (!items.length){ gs = 9; ge = 19; }
  const noSlot = classes.filter(c => !(c.slots || []).length).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  return { items, days, gs, ge, noSlot };
}

export function buildSheet(){
  const { items, days, gs, ge, noSlot } = layout();
  const t = parse(D.today());
  const css = getComputedStyle(document.documentElement);
  const v = name => css.getPropertyValue(name).trim();
  const ink = v("--ink"), muted = v("--muted"), line = v("--line"), accent = v("--accent");
  const head = 92, foot = noSlot.length ? 40 : 24, padX = 36, padY = 24, timeW = 48, dayH = 30;
  const gridH = PAGE_H - padY * 2 - head - foot - dayH;
  const hpx = gridH / (ge - gs);
  const colW = (PAGE_W - padX * 2 - timeW) / days.length;

  const blocks = days.map((d, di) => {
    const list = items.filter(i => i.day === d).sort((a, b) => a.s - b.s);
    const lanes = []; list.forEach(it => { let li = lanes.findIndex(end => end <= it.s); if (li < 0){ li = lanes.length; lanes.push(0); } lanes[li] = it.e; it.lane = li; });
    list.forEach(it => { it.n = Math.max(1, ...list.filter(o => o.s < it.e && o.e > it.s).map(o => o.lane + 1)); });
    return list.map(it => {
      const roster = D.rosterOf(it.c.id).map(r => r.st.name);
      const top = (it.s - gs * 60) / 60 * hpx, h = (it.e - it.s) / 60 * hpx - 4;
      const left = timeW + di * colW + it.lane / it.n * colW + 3, w = colW / it.n - 6;
      const [bg, fg] = PDF_COLORS[it.c.color] || PDF_COLORS.gri;
      // Uzun derste öğrenciler alt alta (eski programdaki gibi); kısa derste yer kazanmak için yan yana.
      const long = it.e - it.s >= 90 && roster.length * 13 + 34 <= h;
      return `<div data-blk style="position:absolute;top:${top + 2}px;left:${left}px;width:${w}px;height:${h}px;border-radius:6px;padding:5px 7px;overflow:hidden;
          background:${bg};color:${fg};font-size:10.5px;line-height:1.25">
        <div style="display:flex;justify-content:space-between;gap:4px;align-items:baseline;margin-bottom:2px">
          <b style="font-size:11.5px;text-decoration:underline;text-underline-offset:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.c.name)}</b>
          <span style="opacity:.75;font-family:var(--f-mono);font-size:8.5px;white-space:nowrap">${it.sl.start}–${it.sl.end}</span></div>
        ${long ? roster.map(n => `<div>• ${esc(n)}</div>`).join("") : `<div>${roster.map(esc).join(", ")}</div>`}
      </div>`;
    }).join("");
  }).join("");

  const hours = Array.from({ length: ge - gs }, (_, i) => `
    <div style="position:absolute;left:0;right:0;top:${i * hpx}px;border-top:1px ${i ? "dashed" : "solid"} ${line}"></div>
    <div style="position:absolute;left:0;width:${timeW - 8}px;top:${i * hpx + 3}px;text-align:right;font-family:var(--f-mono);font-size:9.5px;color:${muted}">${pad(gs + i)}.00</div>`).join("");
  const cols = days.map((d, di) => `
    <div style="position:absolute;top:${-dayH}px;left:${timeW + di * colW}px;width:${colW}px;height:${dayH}px;display:flex;align-items:center;justify-content:center;
      font-family:var(--f-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${ink}">${DAYS[d]}</div>
    <div style="position:absolute;top:0;bottom:0;left:${timeW + di * colW}px;border-left:1px solid ${line}"></div>`).join("");

  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:-20000px;top:0;width:${PAGE_W}px;height:${PAGE_H}px;background:${v("--surface")};color:${ink};
    font-family:var(--f-body);padding:${padY}px ${padX}px;box-sizing:border-box`;
  el.innerHTML = `
    <div style="height:${head}px;display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid ${ink};padding-bottom:14px">
      <div>
        <div style="font-family:var(--f-mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${accent};margin-bottom:6px">İngilizce · Haftalık program</div>
        <div style="font-family:var(--f-display);font-size:38px;line-height:1">Ders <i>Programı</i></div>
        <div style="font-size:11.5px;color:${muted};margin-top:6px">${MONTHS[t.getMonth()]} ${t.getFullYear()} · ${t.getDate()} ${MONTHS[t.getMonth()]} tarihinde hazırlandı</div>
      </div>
      <img src="brand/logo.png" alt="" style="height:74px;width:auto">
    </div>
    <div style="position:relative;margin-top:${dayH}px;height:${gridH}px">${hours}${cols}${blocks}
      <div style="position:absolute;left:0;right:0;bottom:0;border-top:1px solid ${line}"></div></div>
    <div style="position:absolute;left:${padX}px;right:${padX}px;bottom:${padY - 6}px;display:flex;justify-content:space-between;gap:24px;font-size:10.5px;color:${muted}">
      <div>${noSlot.length ? `<b style="color:${ink};font-weight:600">Saati programda olmayan dersler:</b> ${noSlot.map(c => `${esc(c.name)} (${D.rosterOf(c.id).map(r => esc(r.st.name)).join(", ") || "öğrenci yok"})`).join(" · ")}` : ""}</div>
      <div style="font-family:var(--f-mono);letter-spacing:.1em;text-transform:uppercase;white-space:nowrap">English with Kawthar</div>
    </div>`;
  return el;
}

// Kalabalık kutularda öğrenci adları sığana kadar yazıyı biraz küçült (en az 8px).
export function fitBlocks(el){
  el.querySelectorAll("[data-blk]").forEach(b => {
    let fs = 10.5;
    while (b.scrollHeight > b.clientHeight + 1 && fs > 8){ fs -= 0.5; b.style.fontSize = fs + "px"; b.style.lineHeight = "1.18"; }
  });
}

export async function downloadProgramPdf(){
  const el = buildSheet();
  document.body.appendChild(el);
  try {
    await document.fonts.ready;
    fitBlocks(el);
    await Promise.all([...el.querySelectorAll("img")].map(img => img.decode().catch(() => {})));
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: null, logging: false });
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 297, 210);
    pdf.setProperties({ title: "Ders Programı — English with Kawthar" });
    pdf.save(`ders-programi-${D.today()}.pdf`);
  } finally {
    el.remove();
  }
}
