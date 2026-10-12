// Arayüzün kullandığı nesne biçimi (src/domain.js başındaki model) <-> Postgres satırları.
// Arayüz kodu tablo yapısını bilmez; sadece bu dosya bilir.

const opt = v => (v == null ? undefined : Number(v));
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const numOrNull = v => (v === "" || v == null ? null : Number(v));

// Sıra önemli: yabancı anahtarlar yüzünden önce bağımsız tablolar.
export const COLLECTIONS = ["classes", "students", "enrollments", "payments", "events", "extras", "settings", "notes", "products", "sales"];

export const mappers = {
  classes: {
    toRow: (id, d) => ({
      id, name: d.name, kind: d.kind || "grup", color: d.color || "gri",
      capacity: Number(d.capacity) || 0, slots: d.slots || [],
    }),
    fromRow: r => ({ id: r.id, name: r.name, kind: r.kind, color: r.color, capacity: r.capacity, slots: r.slots || [] }),
  },

  students: {
    toRow: (id, d) => ({
      id, name: d.name, parent_name: d.parentName || "", phone: d.phone || "",
      start_date: d.startDate || null, notes: d.notes || "", active: d.active !== false,
    }),
    fromRow: r => ({
      id: r.id, name: r.name, parentName: r.parent_name, phone: r.phone,
      startDate: r.start_date || "", notes: r.notes, active: r.active,
    }),
  },

  enrollments: {
    toRow: (id, d) => {
      const p = d.pay || {};
      return {
        id, student_id: d.studentId, class_id: d.classId || null,
        teacher: d.teacher || "", teacher_share: Number(d.teacherShare) || 0,
        rate: Number(d.rate) || 0, rate_unit: d.rateUnit || "saat",
        pay_mode: p.mode || "aylik", pay_amount: numOrNull(p.amount), pay_due_day: numOrNull(p.dueDay),
        pay_package_hours: numOrNull(p.packageHours),
        start_date: d.startDate || null, active: d.active !== false,
      };
    },
    fromRow: r => ({
      id: r.id, studentId: r.student_id, classId: r.class_id || "",
      teacher: r.teacher, teacherShare: Number(r.teacher_share),
      rate: Number(r.rate), rateUnit: r.rate_unit,
      pay: clean({ mode: r.pay_mode, amount: opt(r.pay_amount), dueDay: opt(r.pay_due_day), packageHours: opt(r.pay_package_hours) }),
      startDate: r.start_date || "", active: r.active,
    }),
  },

  payments: {
    toRow: (id, d) => ({
      id, student_id: d.studentId, enrollment_id: d.enrollmentId, date: d.date, amount: Number(d.amount) || 0, mode: d.mode,
      period: d.period ?? null, hours: numOrNull(d.hours), label: d.label || "", note: d.note || "",
      teacher: d.teacher || "", teacher_cut: Number(d.teacherCut) || 0, teacher_paid: !!d.teacherPaid,
      teacher_paid_date: d.teacherPaidDate || null, partial: !!d.partial, rest_due: d.restDue || null,
    }),
    fromRow: r => clean({
      id: r.id, studentId: r.student_id, enrollmentId: r.enrollment_id, date: r.date, amount: Number(r.amount), mode: r.mode,
      period: r.period ?? undefined, hours: opt(r.hours), label: r.label, note: r.note,
      teacher: r.teacher, teacherCut: Number(r.teacher_cut), teacherPaid: r.teacher_paid,
      teacherPaidDate: r.teacher_paid_date ?? undefined, partial: r.partial || undefined, restDue: r.rest_due ?? undefined,
    }),
  },

  events: {
    toRow: (id, d) => ({
      id, class_id: d.classId, date: d.date, start: d.start, cancelled: !!d.cancelled, absent: d.absent || {},
    }),
    fromRow: r => ({ id: r.id, classId: r.class_id, date: r.date, start: r.start, cancelled: r.cancelled, absent: r.absent || {} }),
  },

  extras: {
    toRow: (id, d) => ({
      id, class_id: d.classId, date: d.date, start_time: d.start, end_time: d.end, type: d.type || "ekstra",
      student_ids: d.studentIds || [], note: d.note || "", cancelled: !!d.cancelled, absent: d.absent || {},
    }),
    fromRow: r => ({
      id: r.id, classId: r.class_id, date: r.date, start: r.start_time, end: r.end_time, type: r.type,
      studentIds: r.student_ids || [], note: r.note, cancelled: r.cancelled, absent: r.absent || {},
    }),
  },

  notes: {
    toRow: (id, d) => clean({ id, date: d.date, text: d.text || "", pinned: !!d.pinned, created_at: d.createdAt || undefined }),
    fromRow: r => ({ id: r.id, date: r.date, text: r.text, pinned: r.pinned, createdAt: r.created_at }),
  },

  settings: {
    toRow: (id, d) => ({ id, data: d }),
    fromRow: r => ({ ...(r.data || {}), id: r.id }),
  },

  products: {
    toRow: (id, d) => ({ id, name: d.name || "", stock: Number(d.stock) || 0, price: Number(d.price) || 0, active: d.active !== false }),
    fromRow: r => ({ id: r.id, name: r.name, stock: Number(r.stock), price: Number(r.price), active: r.active }),
  },

  sales: {
    toRow: (id, d) => ({
      id, product_id: d.productId, student_id: d.studentId, date: d.date, qty: Number(d.qty) || 1,
      unit_price: Number(d.unitPrice) || 0, paid: !!d.paid, paid_date: d.paidDate || null, note: d.note || "",
    }),
    fromRow: r => clean({
      id: r.id, productId: r.product_id, studentId: r.student_id, date: r.date, qty: Number(r.qty),
      unitPrice: Number(r.unit_price), paid: r.paid, paidDate: r.paid_date ?? undefined, note: r.note,
    }),
  },
};
