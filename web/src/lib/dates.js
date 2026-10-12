// Tarih yardımcıları. Tarihler her yerde "YYYY-MM-DD" metni olarak dolaşır (saat dilimi sorunu olmasın).
export const pad = n => String(n).padStart(2, "0");
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
export const wd = s => { const g = parse(s).getDay(); return g === 0 ? 7 : g; };   // 1=Pzt … 7=Paz
export const mondayOf = s => addDays(s, 1 - wd(s));
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
export const monthEnd = key => { const [y, m] = key.split("-").map(Number); return `${key}-${pad(new Date(y, m, 0).getDate())}`; };
export const toMin = t => { const [h, m] = String(t || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
export const fromMin = n => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
export const hoursOf = sl => Math.max(0, (toMin(sl.end) - toMin(sl.start)) / 60);

export const DAYS = ["", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
export const DAYS_S = ["", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
export const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export const fmtDate = s => { if (!s) return "–"; const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const fmtDateYear = s => { if (!s) return "–"; const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const fmtDateLong = s => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${DAYS[wd(s)]}`; };
export const monthLabel = k => { const [y, m] = k.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
export const isTime = s => /^\d{2}:\d{2}$/.test(s || "");
