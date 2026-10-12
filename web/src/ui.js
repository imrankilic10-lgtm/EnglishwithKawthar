// Ortak küçük arayüz parçaları.
import { S, D } from "./app.js";
import { esc, TL, fmtH } from "./lib/format.js";
import { fmtDate, daysBetween, DAYS } from "./lib/dates.js";
import { PAYMODES, OWNER } from "./domain.js";

export const clsColor = cid => S.classes[cid]?.color || "gri";
export const chip = cid => `<span class="chip cls-${clsColor(cid)}">${esc(D.clsName(cid))}</span>`;
// Baş harfli rozet: "Ali Can Yılmaz" -> "AY". Hepsi tek, sade lila ton (renk kuralı: dersin rengi sadece ders etiketinde).
// İkinci parametre (ders) eski çağrılarla uyum için duruyor, kullanılmıyor.
export const initials = name => {
  const w = String(name || "?").trim().split(/\s+/);
  return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : w[0].slice(0, 2)).toLocaleUpperCase("tr");
};
export const avatar = (name, _cid, size = "") =>
  `<span class="av ${size}" aria-hidden="true">${esc(initials(name))}</span>`;
// Ders saati bileti (ders renginde).
export const ticket = (cid, start, end = "") =>
  `<span class="tix cls-${clsColor(cid)}"><b>${start}</b>${end ? `<small>${end}</small>` : ""}</span>`;
export const empty =(msg, extra = "") => `<div class="empty">${msg}${extra}</div>`;
export const shHead = (title, extra = "") =>
  `<div class="sh"><h2>${title}</h2><div class="toolbar">${extra}<button class="btn sm" data-act="close">Kapat</button></div></div>`;
export const unitLabel = e => e?.rateUnit === "hafta" ? "hafta" : "saat";
export const rateText = e => `${TL(e.rate)} / ${unitLabel(e)}`;
export const teacherText = e => e.teacher || OWNER;

// Ödeme düzeninin kısa açıklaması.
export function payDesc(e){
  const p = e.pay || {};
  if (p.mode === "paket") return `${p.packageHours || 8} saatlik paket · ${TL((p.packageHours || 8) * (e.rate || 0))}`;
  if (p.mode === "haftalik") return `Her hafta ${DAYS[p.dueDay || 1]} · ${TL(p.amount)}`;
  return `Her ayın ${p.dueDay || 1}'i · ${TL(p.amount)}`;
}
export const modeLabel = e => PAYMODES[e?.pay?.mode || "aylik"];

// Son ödeme tarihine göre durum etiketi.
export function duePill(r){
  if (!r || r.level === "none" || !r.dueDate) return `<span class="pill none">Program yok</span>`;
  const days = daysBetween(D.today(), r.dueDate);
  if (r.level === "late") return `<span class="pill late">${-days} gün gecikti</span>`;
  if (r.level === "today") return `<span class="pill today">Bugün</span>`;
  if (r.level === "week") return `<span class="pill week">${days} gün kaldı</span>`;
  return `<span class="pill ok">${fmtDate(r.dueDate)}</span>`;
}
// Paket özeti: "ödenen 8 saat · yapılan 5 saat · 3 saat kaldı" (eksi bakiye: ödenmeden yapılan saat)
export function packageText(r){
  const rem = r.remaining > 0.05 ? `<strong>${fmtH(r.remaining)} saat kaldı</strong>`
    : r.remaining < -0.05 ? `<strong>${fmtH(-r.remaining)} saat ödenmeden yapıldı</strong>` : `<strong>paket bitti</strong>`;
  return `ödenen ${fmtH(r.paidH)} saat · yapılan ${fmtH(r.done)} saat · ${rem}`;
}
// Ödendi / Bekliyor / Gecikti
export const STATUS = {
  odendi: `<span class="pill ok">Ödendi</span>`,
  bekliyor: `<span class="pill week">Bekliyor</span>`,
  gecikti: `<span class="pill late">Gecikti</span>`,
};
export const statusOfLevel = lvl => lvl === "late" ? "gecikti" : "bekliyor";

// Bir dersin bir öğrenci için sonucu.
export function attendPill(a, upcoming = false){
  if (a === "iptal") return `<span class="pill none">İptal</span>`;
  if (a === "sayilir") return `<span class="pill today">Gelmedi · sayıldı</span>`;
  if (a === "sayilmaz") return `<span class="pill week">Gelmedi · sayılmadı</span>`;
  return upcoming ? `<span class="pill none">Planlı</span>` : `<span class="pill ok">Yapıldı</span>`;
}
export const typeTag = l => l.type && l.type !== "normal" ? `<span class="tag ${l.type}">${l.type === "telafi" ? "Telafi" : "Ekstra"}</span>` : "";

// Ders seçimi: türlere göre gruplu.
export function classOptions(selected, { withNew = false, placeholder = "Seç" } = {}){
  const kinds = D.kinds();
  const byKind = k => Object.values(S.classes).filter(c => (c.kind || "grup") === k).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  return `<option value="">${placeholder}</option>` + kinds.map(k => {
    const cs = byKind(k.key); if (!cs.length) return "";
    return `<optgroup label="${esc(k.label)}">${cs.map(c => `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</optgroup>`;
  }).join("") + (withNew ? `<option value="__new" ${selected === "__new" ? "selected" : ""}>+ Bu öğrenci için yeni özel ders aç</option>` : "");
}
