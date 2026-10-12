// Küçük, bağımlılıksız grafikler (çubuk + halka) ve ortak ipucu kutusu.
// Renkler: style.css'teki durum değişkenleri (--s-paid / --s-due / --s-late; yumuşatılmış mor / kehribar / gül).
// Üçü açıklıkta da belirgin ayrışır (koyu / açık / orta), renk körlüğünde de seçilir.
// Kural: renk tek başına bilgi taşımaz; her grafikte gösterge + etiketler + tablo görünümü vardır.
import { esc, TL } from "./lib/format.js";

export const SERIES = [
  { key: "alinan", label: "Alınan", color: "var(--s-paid)" },
  { key: "bekliyor", label: "Bekliyor", color: "var(--s-due)" },
  { key: "gecikti", label: "Gecikti", color: "var(--s-late)" },
];

// Kısa tutar: 104.250 -> "104 bin", 1.250.000 -> "1,25 mn"
export const shortTL = n => {
  n = Math.round(Number(n) || 0);
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} mn`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString("tr-TR")} bin`;
  return n.toLocaleString("tr-TR");
};
// Eksen üst sınırı: 1, 2, 2.5, 5 × 10^n
function niceMax(v){
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= v);
}
const legend = series => `<div class="legend-row">${series.map(s => `<span class="lg"><i style="background:${s.color}"></i>${s.label}</span>`).join("")}</div>`;

// Yığılmış sütun grafik. rows: [{ label (eksen), full? (ipucu/tablo), current?, values: { alinan, bekliyor, gecikti } }]
export function stackedBars(rows, { title = "", series = SERIES } = {}){
  const totals = rows.map(r => series.reduce((a, s) => a + (r.values[s.key] || 0), 0));
  const max = niceMax(Math.max(...totals));
  const ticks = [0, max / 2, max];
  const cols = rows.map((r, i) => {
    const name = r.full || r.label;
    const tip = `<b>${esc(name)}</b>${series.map(s => `<span><i style="background:${s.color}"></i>${s.label}: ${TL(r.values[s.key] || 0)}</span>`).join("")}`;
    const segs = series.filter(s => r.values[s.key] > 0)
      .map(s => `<i style="flex:${r.values[s.key]} 1 0;background:${s.color}"></i>`).join("");
    return `<div class="bc-col ${r.current ? "cur" : ""}" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(name)}: ${series.map(s => `${s.label} ${TL(r.values[s.key] || 0)}`).join(", ")}">
      <div class="bc-stack" style="height:${(totals[i] / max) * 100}%">${segs}</div></div>`;
  }).join("");
  return `<div class="chart">
    ${legend(series)}
    <div class="bc" role="group" aria-label="${esc(title)}">
      <div class="bc-plot">
        ${ticks.map(t => `<div class="bc-grid" style="bottom:${(t / max) * 100}%"><span>${shortTL(t)}</span></div>`).join("")}
        <div class="bc-cols">${cols}</div>
      </div>
      <div class="bc-x">${rows.map(r => `<span class="${r.current ? "cur" : ""}">${esc(r.label)}</span>`).join("")}</div>
    </div>
    <details class="tview"><summary>Tablo olarak göster</summary>
      <table><thead><tr><th>Ay</th>${series.map(s => `<th>${s.label}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr><td>${esc(r.full || r.label)}</td>${series.map(s => `<td class="num">${TL(r.values[s.key] || 0)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    </details>
  </div>`;
}

// Halka grafik: parça-bütün, en fazla birkaç dilim. Ortada toplam; yanında etiket + tutar + yüzde (tablo görevi görür).
// Yüzdeleri toplamı tam 100 olacak şekilde yuvarla (en büyük kalan yöntemi).
function percents(values, keys, total){
  if (!total) return Object.fromEntries(keys.map(k => [k, 0]));
  const raw = keys.map(k => ({ k, v: (values[k] || 0) / total * 100 }));
  const out = Object.fromEntries(raw.map(r => [r.k, Math.floor(r.v)]));
  let rest = 100 - raw.reduce((a, r) => a + Math.floor(r.v), 0);
  raw.sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v))).forEach(r => { if (rest > 0 && r.v > 0){ out[r.k]++; rest--; } });
  return out;
}

export function donut(values, { series = SERIES, centerLabel = "toplam" } = {}){
  const total = series.reduce((a, s) => a + (values[s.key] || 0), 0);
  const p = percents(values, series.map(s => s.key), total);
  const pctText = k => (values[k] > 0 && p[k] === 0) ? "<%1" : `%${p[k]}`;   // sıfır olmayan küçük dilim "%0" görünmesin
  const R = 52, C = 2 * Math.PI * R, GAP = total ? 2 : 0;
  let off = 0;
  const arcs = total ? series.filter(s => values[s.key] > 0).map(s => {
    const len = (values[s.key] / total) * C;
    const dash = Math.max(0.01, len - GAP);
    const tip = `<b>${s.label}</b><span>${TL(values[s.key])} · ${pctText(s.key)}</span>`;
    const el = `<circle r="${R}" cx="70" cy="70" fill="none" style="stroke:${s.color}" stroke-width="16" stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-off}" data-tip="${esc(tip)}" tabindex="0"><title>${s.label}: ${TL(values[s.key])}</title></circle>`;
    off += len; return el;
  }).join("") : `<circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--line)" stroke-width="16"/>`;
  return `<div class="chart dn">
    <div class="dn-ring"><svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Ödeme durumu: ${series.map(s => `${s.label} ${TL(values[s.key] || 0)}`).join(", ")}">
      <g transform="rotate(-90 70 70)">${arcs}</g></svg>
      <div class="dn-c"><b>${shortTL(total)}</b><small>${centerLabel}</small></div></div>
    <ul class="dn-l">${series.map(s => `<li><i style="background:${s.color}"></i><span>${s.label}</span><b class="num">${TL(values[s.key] || 0)}</b><small class="num">${pctText(s.key)}</small></li>`).join("")}</ul>
  </div>`;
}

// Ortak ipucu kutusu: fare ya da klavye odağı (aynı içerik).
let tipEl = null;
function showTip(target){
  if (!tipEl){ tipEl = document.createElement("div"); tipEl.className = "chart-tip"; tipEl.setAttribute("role", "status"); document.body.appendChild(tipEl); }
  tipEl.innerHTML = target.dataset.tip;
  tipEl.hidden = false;
  const r = target.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
  let x = r.left + r.width / 2 - t.width / 2, y = r.top - t.height - 8;
  x = Math.max(8, Math.min(x, innerWidth - t.width - 8));
  if (y < 8) y = r.bottom + 8;
  tipEl.style.left = `${x}px`; tipEl.style.top = `${y}px`;
}
const hideTip = () => { if (tipEl) tipEl.hidden = true; };
const tipTarget = e => e.target.closest?.(".chart [data-tip]");
document.addEventListener("mouseover", e => { const t = tipTarget(e); if (t) showTip(t); });
document.addEventListener("mouseout", e => { if (tipTarget(e)) hideTip(); });
document.addEventListener("focusin", e => { const t = tipTarget(e); if (t) showTip(t); else hideTip(); });
document.addEventListener("focusout", e => { if (tipTarget(e)) hideTip(); });
document.addEventListener("scroll", hideTip, { passive: true, capture: true });
