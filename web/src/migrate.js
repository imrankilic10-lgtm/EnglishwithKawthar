// Veri modeli v1 -> v2 taşıması.
//
// v1 (claude.ai sürümü): her ders kaydı ayrı bir "öğrenci". Aynı çocuk iki derse gidiyorsa iki kayıt var.
// v2: students = kişi (ad, veli, telefon, not, aktif), enrollments = kişinin bir derse kaydı (ders, hoca, ücret, ödeme düzeni).
//
// Kurallar:
// - Hiçbir kayıt silinmez ya da yeniden üretilmez. Her v1 öğrenci kaydı tam olarak bir v2 ders kaydına dönüşür.
// - Kişi ID'si: v1 öğrenci ID'si (birleştirilenlerde merges'teki hedef). Ders kaydı ID'si: "e_" + v1 ID'sinin s_ sonrası.
// - Ödemeler aynı ID'yle kalır; studentId kişiye, enrollmentId ilgili ders kaydına bağlanır.
// - Ders istisnalarındaki (events.absent) öğrenci anahtarları kişi ID'sine çevrilir.
// Bu fonksiyon saf: hem Node scriptleri hem tarayıcıdaki demo modu kullanır. Geçiş günü yeni dışa aktarıma tekrar uygulanır.
//
// Veriye özgü ayarlar kodda DEĞİL, gerçek veriyle birlikte data/tasima-ayarlari.json dosyasında durur (depoya girmez):
//   { "merges":   { "birleşecek v1 öğrenci ID": "ana kayıt ID" },     // aynı kişiye ait iki v1 kaydı
//     "partials": { "ödeme ID": "YYYY-MM-DD" } }                      // v1'in bilmediği kısmi ödemeler (kalanın son günü)

import { DEFAULT_KINDS } from "./domain.js";

export const isV2 = d => !!d && typeof d.enrollments === "object";

const enrollmentIdFor = oldId => "e_" + oldId.replace(/^s_/, "");
const mode = arr => { const c = new Map(); arr.forEach(v => c.set(v, (c.get(v) || 0) + 1)); return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; };

export function migrateV1toV2(v1, { merges = {}, partials = {} } = {}){
  const report = [], errors = [];
  const classes = structuredClone(v1.classes || {});
  const students = {}, enrollments = {}, payments = {}, events = {}, notes = {};
  const personOf = {};
  const v1s = v1.students || {};

  for (const [from, to] of Object.entries(merges)){
    if (!v1s[from]) continue;  // birleşecek kayıt bu dışa aktarımda yoksa sorun değil
    if (!v1s[to]) errors.push(`Birleştirme hedefi bulunamadı: ${from} -> ${to}`);
    else if (v1s[from].name.trim() !== v1s[to].name.trim()) report.push(`Uyarı: ${from} (${v1s[from].name}) ile ${to} (${v1s[to].name}) farklı isimde ama birleştirildi.`);
  }

  // Ana kayıtlar önce işlensin ki kişinin adı ana kayıttan gelsin.
  const order = Object.keys(v1s).sort((a, b) => (merges[a] ? 1 : 0) - (merges[b] ? 1 : 0) || a.localeCompare(b));
  for (const oldId of order){
    const s = v1s[oldId];
    const pid = merges[oldId] && v1s[merges[oldId]] ? merges[oldId] : oldId;
    const eid = enrollmentIdFor(oldId);
    personOf[oldId] = pid;
    if (s.classId && !classes[s.classId]) report.push(`Uyarı: ${s.name} kaydının dersi (${s.classId}) yok; ders kaydı dersiz taşındı.`);

    enrollments[eid] = {
      studentId: pid, classId: s.classId || "",
      teacher: s.teacher || "", teacherShare: Number(s.teacherShare) || 0,
      rate: Number(s.rate) || 0, rateUnit: s.rateUnit || "saat",
      pay: structuredClone(s.pay || { mode: "aylik", dueDay: 1 }),
      startDate: s.startDate || "", active: s.active !== false,
    };

    const p = students[pid] ||= { name: s.name.trim(), parentName: "", phone: "", startDate: s.startDate || "", notes: "", active: false };
    p.parentName ||= s.parentName || "";
    p.phone ||= s.phone || "";
    if (s.startDate && (!p.startDate || s.startDate < p.startDate)) p.startDate = s.startDate;
    p.active = p.active || s.active !== false;
    if (s.notes?.trim()) (notes[pid] ||= []).push({ cls: classes[s.classId]?.name || "", text: s.notes.trim() });
    if (pid !== oldId) report.push(`Birleştirildi: ${s.name} — "${classes[s.classId]?.name || s.classId}" kaydı ${pid} kişisine bağlandı.`);
  }
  // Tek derslik kişide not olduğu gibi kalır; çok derslikte hangi derse ait olduğu başına yazılır.
  for (const [pid, list] of Object.entries(notes)){
    students[pid].notes = list.length === 1 ? list[0].text : list.map(n => `${n.cls}: ${n.text}`).join("\n");
  }

  for (const [id, p] of Object.entries(v1.payments || {})){
    if (!v1s[p.studentId]){ errors.push(`Ödeme ${id} olmayan bir öğrenciye bağlı (${p.studentId}).`); continue; }
    payments[id] = { ...structuredClone(p), studentId: personOf[p.studentId], enrollmentId: enrollmentIdFor(p.studentId) };
    if (partials[id] && p.partial === undefined){
      Object.assign(payments[id], { partial: true, restDue: partials[id] });
      report.push(`Kısmi ödeme: ${id} (${v1s[p.studentId].name}) — kalanın son günü ${partials[id]}.`);
    }
  }

  for (const [id, ev] of Object.entries(v1.events || {})){
    const absent = {};
    for (const [sid, v] of Object.entries(ev.absent || {})) absent[personOf[sid] || sid] = v;
    events[id] = { ...structuredClone(ev), absent };
  }

  // Ayarlar: mevcut veriden türetilir (ders türleri + hocalar ve en sık kullanılan payları).
  const enrList = Object.values(enrollments);
  const kinds = DEFAULT_KINDS.map(k => {
    const rates = enrList.filter(e => classes[e.classId]?.kind === k.key && e.rateUnit === "saat").map(e => e.rate);
    return { ...k, defaultRate: mode(rates) || 0 };
  });
  const teacherNames = [...new Set(enrList.map(e => e.teacher).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
  const teachers = teacherNames.map(name => ({ name, share: mode(enrList.filter(e => e.teacher === name).map(e => e.teacherShare)) || 0 }));
  const settings = { main: { kinds, teachers } };

  const data = { version: 2, classes, students, enrollments, payments, events, extras: {}, settings, notes: {} };

  // Sağlama: hiçbir şey kaybolmadı mı?
  const n = o => Object.keys(o || {}).length;
  const sum = o => Object.values(o || {}).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  if (n(enrollments) !== n(v1s)) errors.push(`Ders kaydı sayısı tutmuyor: ${n(enrollments)} / ${n(v1s)}`);
  if (n(payments) !== n(v1.payments)) errors.push(`Ödeme sayısı tutmuyor: ${n(payments)} / ${n(v1.payments)}`);
  if (sum(payments) !== sum(v1.payments)) errors.push(`Ödeme toplamı tutmuyor: ${sum(payments)} / ${sum(v1.payments)}`);
  if (n(classes) !== n(v1.classes)) errors.push("Ders sayısı tutmuyor.");
  if (n(events) !== n(v1.events)) errors.push("Ders istisnası sayısı tutmuyor.");

  const summary = {
    classes: n(classes), students: `${n(v1s)} kayıt -> ${n(students)} kişi`, enrollments: n(enrollments),
    payments: n(payments), paymentTotal: sum(payments), events: n(events),
  };
  return { data, report, errors, summary };
}

// Dosya hangi sürümde olursa olsun v2 döndürür.
export function toV2(dump, opts = {}){
  if (isV2(dump)) return { data: dump, report: [], errors: [], summary: null };
  return migrateV1toV2(dump, opts);
}
