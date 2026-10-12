export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const TL = n => (Math.round(Number(n) || 0)).toLocaleString("tr-TR") + " TL";
export const fmtH = h => (Math.round(h * 10) / 10).toLocaleString("tr-TR");
export const uid = p => p + "_" + Math.random().toString(36).slice(2, 10);
export const lower = s => String(s || "").toLocaleLowerCase("tr");
