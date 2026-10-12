// İş kuralları. Arayüzden bağımsız, saf fonksiyonlar: veri (S) + saat (clock) alır, hesap döndürür.
// Node testleri de bu dosyayı doğrudan kullanır (tests/).
//
// Veri modeli (v2):
//   students/{id}     kişi: { name, parentName, phone, startDate, notes, active }
//   enrollments/{id}  kişinin bir derse kaydı: { studentId, classId, teacher, teacherShare, rate, rateUnit,
//                     pay: { mode: aylik|haftalik|paket, amount?, dueDay?, packageHours? }, startDate, active }
//   classes/{id}      { name, kind, color, capacity, slots: [{ day, start, end }] }
//   payments/{id}     { studentId, enrollmentId, date, amount, mode, period?, hours?, label, note,
//                     teacher, teacherCut, teacherPaid, teacherPaidDate?, partial?, restDue? }
//                     partial: dönemin bir kısmı ödendi, kalanı restDue tarihine kadar beklenir
//   events/{classId_YYYY-MM-DD_HHMM}  haftalık dersin istisnası: { classId, date, start, cancelled, absent: { studentId: sayilir|sayilmaz } }
//   extras/{id}       programa bağlı olmayan tek seferlik ders: { classId, date, start, end, type: telafi|ekstra,
//                     studentIds: [], note, cancelled, absent }
//   settings/main     { kinds: [{ key, label, defaultRate }], teachers: [{ name, share }] }
//   notes/{id}        günlük not: { date: YYYY-MM-DD, text, pinned, createdAt (ISO) }

import { pad, addDays, mondayOf, wd, toMin, hoursOf, fmtDate, monthLabel, monthEnd } from "./lib/dates.js";

export const PAYMODES = { aylik: "Aylık", haftalik: "Haftalık", paket: "Paket (ders saati)" };
export const LESSON_TYPES = { normal: "Normal", telafi: "Telafi", ekstra: "Ekstra" };
export const ATTEND = { geldi: "Geldi", sayilir: "Gelmedi, ders sayılsın", sayilmaz: "Gelmedi, sayılmasın" };
export const DEFAULT_KINDS = [
  { key: "grup", label: "Grup" }, { key: "ozel", label: "Özel ders" },
  { key: "online", label: "Online" }, { key: "matematik", label: "Matematik" },
];
export const COLORS = ["pembe", "turuncu", "lila", "mavi", "yesil", "sari", "somon", "turkuaz", "gri"];
// Kurs sahibi. Ders kaydında öğretmen alanı boşsa dersi o verir; hoca payı hesaplanmaz.
export const OWNER = "Kevser Hanım";
export const isOwner = name => !String(name || "").trim() || String(name).trim().toLocaleLowerCase("tr") === OWNER.toLocaleLowerCase("tr");
export const evId =(cid, date, start) => `${cid}_${date}_${String(start).replace(":", "")}`;

const byName = (a, b) => (a?.name || "").localeCompare(b?.name || "", "tr");
const byTime = (a, b) => a.date === b.date ? toMin(a.start) - toMin(b.start) : a.date.localeCompare(b.date);
const byDateDesc = (a, b) => (b.date || "").localeCompare(a.date || "");

export function createDomain(S, clock){
  const today = () => clock.today();

  // ---------- kişiler ve ders kayıtları ----------
  const clsName = cid => S.classes[cid]?.name || "Ders yok";
  const isActiveStudent = s => !!s && s.active !== false;
  const isActiveEnr = e => !!e && e.active !== false && isActiveStudent(S.students[e.studentId]);
  const activeStudents = () => Object.values(S.students).filter(isActiveStudent).sort(byName);
  const activeEnrollments = () => Object.values(S.enrollments).filter(isActiveEnr);
  const enrollmentsOf = (sid, all = false) => Object.values(S.enrollments)
    .filter(e => e.studentId === sid && (all || e.active !== false))
    .sort((a, b) => (b.active !== false) - (a.active !== false) || clsName(a.classId).localeCompare(clsName(b.classId), "tr"));
  const enrollmentIn = (sid, cid) => Object.values(S.enrollments).find(e => e.studentId === sid && e.classId === cid && e.active !== false)
    || Object.values(S.enrollments).find(e => e.studentId === sid && e.classId === cid);
  const rosterOf = cid => activeEnrollments().filter(e => e.classId === cid)
    .map(e => ({ e, st: S.students[e.studentId] })).sort((a, b) => byName(a.st, b.st));
  const paymentsOfEnr = eid => Object.values(S.payments).filter(p => p.enrollmentId === eid).sort(byDateDesc);
  const paymentsOfStudent = sid => Object.values(S.payments).filter(p => p.studentId === sid).sort(byDateDesc);

  // ---------- dersler ----------
  function weekly(cls, from, to, cap = 3000){
    const out = []; if (!cls?.slots?.length || from > to) return out;
    let d = from, n = 0;
    while (d <= to && n < cap){
      const w = wd(d);
      for (const sl of cls.slots) if (Number(sl.day) === w){
        out.push({ classId: cls.id, date: d, start: sl.start, end: sl.end, hours: hoursOf(sl), type: "normal", key: evId(cls.id, d, sl.start), studentIds: null });
        n++;
      }
      d = addDays(d, 1);
    }
    return out;
  }
  function extrasOf(cid, from, to){
    return Object.values(S.extras).filter(x => (!cid || x.classId === cid) && x.date >= from && x.date <= to)
      .map(x => ({ classId: x.classId, date: x.date, start: x.start, end: x.end, hours: hoursOf(x), type: x.type || "ekstra",
        key: x.id, extraId: x.id, studentIds: x.studentIds || [], note: x.note || "" }));
  }
  function decorate(l){
    const src = l.extraId ? S.extras[l.extraId] : S.events[l.key];
    return { ...l, cancelled: !!src?.cancelled, absent: src?.absent || {} };
  }
  const classLessons = (cid, from, to) => [...weekly(S.classes[cid], from, to), ...extrasOf(cid, from, to)].map(decorate).sort(byTime);
  const lessonsBetween = (from, to) => Object.keys(S.classes).flatMap(cid => classLessons(cid, from, to)).sort(byTime);
  const lessonsOn = date => lessonsBetween(date, date);
  function findLesson({ classId, date, start, extraId }){
    if (extraId){
      const x = S.extras[extraId]; if (!x) return null;
      return extrasOf(x.classId, x.date, x.date).map(decorate).find(l => l.extraId === extraId) || null;
    }
    return classLessons(classId, date, date).find(l => !l.extraId && l.start === start) || null;
  }

  const isDone = l => l.date < today() || (l.date === today() && toMin(l.end) <= clock.nowMin());
  const attendanceOf = (l, sid) => l.cancelled ? "iptal" : (l.absent[sid] || "geldi");
  // İptal edilen ders kimseden düşmez; "gelmedi, sayılmasın" o öğrenciden düşmez; geri kalan her şey sayılır.
  const counts = (l, sid) => !l.cancelled && l.absent[sid] !== "sayilmaz";

  // Bir derse katılması beklenenler. Haftalık derste: derse kayıtlı ve o tarihte başlamış olanlar. Telafi/ekstrada: seçilen kişiler.
  function participants(l){
    if (l.type === "normal") return rosterOf(l.classId).filter(r => !r.e.startDate || r.e.startDate <= l.date);
    return (l.studentIds || []).map(sid => ({ st: S.students[sid], e: enrollmentIn(sid, l.classId) })).filter(r => r.st);
  }
  // Bir ders kaydının dersleri: haftalık program (kayıt tarihinden itibaren) + o kişinin seçildiği telafi/ekstra dersler.
  function lessonsOfEnrollment(e, from, to){
    const start = e.startDate && e.startDate > from ? e.startDate : from;
    return classLessons(e.classId, start, to).filter(l => l.type === "normal" || l.studentIds.includes(e.studentId));
  }
  const hoursDone = e => lessonsOfEnrollment(e, e.startDate || today(), today())
    .filter(l => isDone(l) && counts(l, e.studentId)).reduce((a, l) => a + l.hours, 0);
  const weeklyHours = cls => (cls?.slots || []).reduce((a, s) => a + hoursOf(s), 0);

  // ---------- ödemeler ----------
  // Aylık / haftalık ödeme dönemleri, kayıt tarihinden itibaren sırayla.
  // Dönem kapanır: ödenen toplam dönem tutarına ulaşınca ya da "kısmi" işaretsiz bir ödeme varsa (ör. indirimli ay).
  // Kısmi ödemede (partial) dönem açık kalır: kalan tutar beklenir, son günü ödemeyle girilen restDue olur.
  // Dönem: { period, dueDate (kısmi ödemede kalanın son günü), baseDue (dönemin asıl son günü), label,
  //          full (dönem tutarı), paid, payments, done, amount (kalan; hiç ödenmediyse tamamı) }
  function* periods(e){
    const p = e.pay || {}; const mode = p.mode || "aylik"; const start = e.startDate || today();
    const byPeriod = new Map();
    for (const x of paymentsOfEnr(e.id)) if (x.period){ if (!byPeriod.has(x.period)) byPeriod.set(x.period, []); byPeriod.get(x.period).push(x); }
    const full = Number(p.amount) || 0;
    const item = (period, dueDate, label) => {
      const pays = byPeriod.get(period) || [];
      const paid = pays.reduce((a, x) => a + (Number(x.amount) || 0), 0);
      const done = pays.length > 0 && (paid >= full || pays.some(x => !x.partial));
      const rest = done ? null : pays.map(x => x.partial && x.restDue).filter(Boolean).sort().pop();
      return { period, dueDate: rest && rest > dueDate ? rest : dueDate, baseDue: dueDate, label, full, paid, payments: pays, done,
        amount: done ? full : Math.max(0, full - paid) };
    };
    if (mode === "aylik"){
      let [y, m] = start.split("-").map(Number);
      for (let i = 0; i < 240; i++){
        const key = `${y}-${pad(m)}`, dim = new Date(y, m, 0).getDate();
        let due = `${key}-${pad(Math.min(Number(p.dueDay) || 1, dim))}`;
        if (due < start) due = start;
        yield item(key, due, monthLabel(key));
        m++; if (m > 12){ m = 1; y++; }
      }
    } else if (mode === "haftalik"){
      let mon = mondayOf(start);
      for (let i = 0; i < 1040; i++){
        let due = addDays(mon, (Number(p.dueDay) || 1) - 1);
        if (due < start) due = start;
        yield item(mon, due, `${fmtDate(mon)} haftası`);
        mon = addDays(mon, 7);
      }
    }
  }
  function periodDue(e, period){
    if (!period) return null;
    for (const x of periods(e)){ if (x.period === period) return x.baseDue; if (x.period > period) break; }
    return null;
  }
  function levelOf(due){
    if (!due) return "none";
    const t = today();
    if (due < t) return "late";
    if (due === t) return "today";
    if (due <= addDays(t, 7)) return "week";
    return "ok";
  }

  // Sıradaki (en eski) ödenmemiş dönem.
  function status(e){
    const p = e.pay || {}; const mode = p.mode || "aylik";
    let r = { mode, dueDate: null, amount: 0, period: null, periodLabel: "", hours: 0 };
    if (mode === "paket"){
      const paidH = paymentsOfEnr(e.id).reduce((a, x) => a + (Number(x.hours) || 0), 0);
      const pk = Number(p.packageHours) || 8;
      const occ = lessonsOfEnrollment(e, e.startDate || today(), addDays(today(), 400)).filter(l => counts(l, e.studentId));
      let cum = 0, due = null;
      for (const l of occ){ if (cum + l.hours > paidH + 1e-9){ due = l.date; break; } cum += l.hours; }
      const done = hoursDone(e);
      r = { ...r, dueDate: due, amount: pk * (Number(e.rate) || 0), hours: pk, periodLabel: `${pk} saatlik paket`, remaining: paidH - done, paidH, done };
    } else {
      for (const x of periods(e)) if (!x.done){ r = { ...r, dueDate: x.dueDate, amount: x.amount, paid: x.paid, period: x.period, periodLabel: x.label }; break; }
    }
    r.level = levelOf(r.dueDate);
    return r;
  }
  // Son günü `until` tarihine kadar gelmiş tüm ödenmemiş dönemler.
  function dues(e, until){
    const mode = e.pay?.mode || "aylik";
    if (mode === "paket"){ const r = status(e); return r.dueDate && r.dueDate <= until ? [r] : []; }
    const out = [];
    for (const x of periods(e)){
      if (x.dueDate > until) break;
      if (!x.done) out.push({ mode, dueDate: x.dueDate, amount: x.amount, paid: x.paid, period: x.period, periodLabel: x.label, level: levelOf(x.dueDate) });
    }
    return out;
  }
  // Ödeme bekleyen kalemler (gecikmiş + önümüzdeki `days` gün), en acil olan önce.
  const pendingDues = (days = 7) => activeEnrollments()
    .flatMap(e => dues(e, addDays(today(), days)).map(d => ({ e, st: S.students[e.studentId], d })))
    .sort((a, b) => a.d.dueDate.localeCompare(b.d.dueDate) || byName(a.st, b.st));
  // Kişinin en acil ödeme durumu (birden çok dersi varsa).
  function studentStatus(sid){
    const rs = enrollmentsOf(sid).filter(isActiveEnr).map(e => ({ e, r: status(e) }));
    return rs.filter(x => x.r.dueDate).sort((a, b) => a.r.dueDate.localeCompare(b.r.dueDate))[0] || rs[0] || null;
  }

  // Bir hafta (Pazartesi tarihi), günlerinin çoğunun düştüğü aya aittir = perşembesinin ayı.
  // Ör. 31 Ağustos–6 Eylül haftası Eylül'e, 28 Eylül–4 Ekim haftası Ekim'e yazılır.
  const weekMonth = mon => addDays(mon, 3).slice(0, 7);
  // Ödemenin AİT OLDUĞU AY — her ekranda aynı kural (liste, tablo, Bugün, Hocalar, net kazanç):
  // aylıkta dönemi, haftalıkta haftanın ayı (weekMonth), pakette ödeme tarihi.
  // Ör. Ekim ücreti Eylül'ün son günü ödense de Ekim'e yazılır.
  function paymentMonth(p){
    const per = p.period || "";
    if (per.length === 7) return per;
    if (per.length === 10) return weekMonth(per);
    return (p.date || "").slice(0, 7);
  }

  // Ödenmemiş kalemin ait olduğu ay (paymentMonth ile aynı kural). Pakette son günün ayı.
  // Kısmi ödemenin kalanı, son günü sonraki aya sarksa da dönemin ayında kalır.
  const dueMonth = d => !d.period ? d.dueDate.slice(0, 7) : d.period.length === 7 ? d.period : weekMonth(d.period);

  // Bir ayın tahsilat özeti: alınan (o aya ait ödemeler) + o aya ait ödenmemiş kalemler
  // (son günü geçtiyse "gecikti", gelmediyse "bekliyor"). Grafikler için.
  function monthSummary(key){
    const end = monthEnd(key), t = today();
    const alinan = Object.values(S.payments).filter(p => paymentMonth(p) === key).reduce((a, p) => a + (Number(p.amount) || 0), 0);
    let bekliyor = 0, gecikti = 0;
    for (const e of activeEnrollments()) for (const d of dues(e, addDays(end, 70))){
      if (dueMonth(d) !== key) continue;
      if (d.dueDate < t) gecikti += d.amount; else bekliyor += d.amount;
    }
    return { key, alinan, bekliyor, gecikti };
  }

  // Hoca payı: tutar × hoca payı / ders ücreti (aynı birimle).
  const teacherCut = (e, amount) => (e?.teacher && Number(e.teacherShare) && Number(e.rate))
    ? Math.round(amount * Number(e.teacherShare) / Number(e.rate)) : 0;

  // ---------- ödeme tablosu (eski Excel düzeni: satır = ders kaydı, sütun = ay) ----------
  // Eğitim yılı Eylül'de başlar: 2026 = Eylül 2026 – Ağustos 2027.
  const seasonOf = date => { const [y, m] = date.split("-").map(Number); return m >= 9 ? y : y - 1; };
  const seasonMonths = y => Array.from({ length: 12 }, (_, i) => { const m = (8 + i) % 12 + 1; return `${m >= 9 ? y : y + 1}-${pad(m)}`; });
  // Bir ders kaydının ay ay ödeme durumu. Ödeme ait olduğu aya yazılır (paymentMonth): aylıkta dönemi, haftalıkta
  // haftanın ayı, pakette ödeme tarihi. Ödenmemiş dönem (ya da kısmi ödenmiş dönemin kalanı): son günü geçtiyse gecikti;
  // bu aya ya da 7 gün içine düşüyorsa bekliyor; sonrası gelecek.
  // Durum: odendi | bekliyor | gecikti | gelecek | yok (o ay kaydı yok). Bırakılmış kayıtta sadece alınan ödemeler görünür.
  function monthCells(e, keys){
    const t = today(), mode = e.pay?.mode || "aylik";
    const horizon = [monthEnd(t.slice(0, 7)), addDays(t, 7)].sort()[1];
    const cells = Object.fromEntries(keys.map(k => [k, { key: k, pays: [], open: [], future: [], paidWeeks: new Set(), openWeeks: new Set() }]));
    // Dönemin ait olduğu ay (paymentMonth ile aynı kural; kısmi ödemenin kalanı da dönemin ayında kalır).
    const monthOfPeriod = per => per.length === 7 ? per : weekMonth(per);
    for (const p of paymentsOfEnr(e.id)){
      const per = p.period || "";
      const c = cells[paymentMonth(p)];
      if (!c) continue;
      c.pays.push(p);
      if (per.length === 10) c.paidWeeks.add(per);
    }
    if (isActiveEnr(e)){
      // Bu aya ya da geçmiş aylara ait ödenmemiş tutar hep beklenir (kısmi ödemenin kalanının son günü sonraki aya sarksa bile).
      const add = (key, dueDate, amount, period) => {
        const c = cells[key]; if (!c) return;
        (dueDate <= horizon || key <= t.slice(0, 7) ? c.open : c.future).push({ dueDate, amount, period });
        if (mode === "haftalik") c.openWeeks.add(period);
      };
      if (mode === "paket"){ const r = status(e); if (r.dueDate) add(r.dueDate.slice(0, 7), r.dueDate, r.amount, null); }
      else for (const x of periods(e)){
        if (monthOfPeriod(x.period) > keys[keys.length - 1]) break;
        if (!x.done) add(monthOfPeriod(x.period), x.dueDate, x.amount, x.period);
      }
    }
    const sum = (list, f) => list.reduce((a, x) => a + (Number(f(x)) || 0), 0);
    return keys.map(k => {
      const { paidWeeks, openWeeks, ...c } = cells[k], late = c.open.filter(x => x.dueDate < t);
      const weeks = new Set([...paidWeeks, ...openWeeks]).size, weeksPaid = [...paidWeeks].filter(w => !openWeeks.has(w)).length;
      // partial: aylık dönemin bir kısmı ödenmiş, kalanı bekleniyor.
      return { ...c, weeks, weeksPaid, partial: mode === "aylik" && c.pays.length > 0 && c.open.length + c.future.length > 0,
        status: late.length ? "gecikti" : c.open.length ? "bekliyor" : c.pays.length ? "odendi" : c.future.length ? "gelecek" : "yok",
        paid: sum(c.pays, p => p.amount), cut: sum(c.pays, p => p.teacherCut), hours: sum(c.pays, p => p.hours),
        due: sum(c.open, x => x.amount), lateAmount: sum(late, x => x.amount), lateCount: late.length,
        expected: sum(c.future, x => x.amount), next: [...c.open, ...c.future][0] || null };
    });
  }

  // ---------- ayarlar ----------
  const settings = () => S.settings?.main || {};
  function kinds(){
    const list = (settings().kinds?.length ? settings().kinds : DEFAULT_KINDS).map(k => ({ ...k }));
    for (const c of Object.values(S.classes)) if (c.kind && !list.some(k => k.key === c.kind)) list.push({ key: c.kind, label: c.kind });
    return list;
  }
  const kindLabel = k => kinds().find(x => x.key === k)?.label || k || "";
  function teachers(){
    const m = new Map();
    (settings().teachers || []).forEach(t => t.name && m.set(t.name, { name: t.name, share: Number(t.share) || 0 }));
    Object.values(S.enrollments).forEach(e => e.teacher && !m.has(e.teacher) && m.set(e.teacher, { name: e.teacher, share: 0 }));
    return [...m.values()].sort(byName);
  }

  return {
    today, clsName, isActiveStudent, isActiveEnr, activeStudents, activeEnrollments, enrollmentsOf, enrollmentIn, rosterOf,
    paymentsOfEnr, paymentsOfStudent,
    weekly, classLessons, lessonsBetween, lessonsOn, findLesson, isDone, attendanceOf, counts, participants,
    lessonsOfEnrollment, hoursDone, weeklyHours,
    periods, periodDue, levelOf, status, dues, pendingDues, studentStatus, teacherCut, monthSummary,
    seasonOf, seasonMonths, monthCells, paymentMonth, dueMonth,
    kinds, kindLabel, teachers,
  };
}
