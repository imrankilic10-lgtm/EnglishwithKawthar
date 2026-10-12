// Uygulama çekirdeği: durum, iş kuralları örneği, veri yazma, sayfa (sheet) ve kayıt defteri.
// Ekranlar (views/) ve sayfalar (sheets/) bunları içe aktarır; birbirlerini bilmezler.
import { createDomain } from "./domain.js";
import { ymd, mondayOf } from "./lib/dates.js";
import { esc } from "./lib/format.js";

export const clock = {
  today: () => ymd(new Date()),
  nowMin: () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); },
};

// Veri koleksiyonları + ekran durumu (filtreler, seçili gün/hafta/ay).
export const S = {
  classes: {}, students: {}, enrollments: {}, payments: {}, events: {}, extras: {}, settings: {}, notes: {}, products: {}, sales: {},
  saleQ: "", saleState: "",
  loaded: new Set(),
  tab: "ozet",
  day: clock.today(), week: mondayOf(clock.today()), month: clock.today().slice(0, 7),
  stuQ: "", stuState: "aktif", stuCls: "", stuTeacher: "",
  payStatus: "", payCls: "", payQ: "", payView: "liste", paySeason: null,
  noteQ: "", noteDraft: "", noteDate: null, noteEdit: null, noteEditText: "", noteDel: null,
  user: null,          // { email, role } (Supabase'de)
};
export const D = createDomain(S, clock);
export const ctx = { db: null };

// ---------- kayıt defteri ----------
// Her modül şunlardan istediğini dışa aktarır:
//   views    { sekme: () => html }             sheets   { tür: () => html | null }
//   actions  { data-act: (el, event) => … }    changes  { data-change: (el) => … }
//   inputs   { data-input: (el) => … }         submits  { formId: (form, err) => … }
//   beforeRender: () => …  (ekran yeniden çizilmeden önce, ör. yazılmamış form taslağını korumak için)
export const R = { views: {}, sheets: {}, actions: {}, changes: {}, inputs: {}, submits: {}, beforeRender: [] };
export function register(m){
  for (const k of ["views", "sheets", "actions", "changes", "inputs", "submits"]) Object.assign(R[k], m[k] || {});
  if (m.beforeRender) R.beforeRender.push(m.beforeRender);
}

// ---------- yazma ----------
export async function save(col, id, data){
  if (!ctx.db){ toast("Kayıt yapılamadı: veri bağlantısı yok."); return false; }
  try { await ctx.db.save(col, id, JSON.parse(JSON.stringify(data))); return true; }
  catch(e){ toast(e?.code === "forbidden" ? "Bu kaydı değiştirme yetkin yok." : "Kayıt yapılamadı. İnternet bağlantını kontrol edip tekrar dene."); return false; }
}
export async function remove(col, id){
  if (!ctx.db) return false;
  try { await ctx.db.remove(col, id); return true; }
  catch(e){ toast(e?.code === "forbidden" ? "Bunu silme yetkin yok." : "Silinemedi, tekrar dene."); return false; }
}
export const strip = d => { const { id, ...rest } = d; return rest; };

// ---------- bildirim ----------
export function toast(msg){
  const r = document.getElementById("toastRoot");
  r.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`;
  clearTimeout(toast.t); toast.t = setTimeout(() => { r.innerHTML = ""; }, 2600);
}

// ---------- çizim ----------
let renderFn = () => {};
export const setRenderer = fn => { renderFn = fn; };
let rq = 0;
export function scheduleRender(){ cancelAnimationFrame(rq); rq = requestAnimationFrame(() => { renderFn(); refreshSheet(); }); }

// ---------- sayfa (sağdan açılan panel) ----------
export const UI = { sheet: null };
export function openSheet(s){ UI.sheet = s; drawSheet(); }
export function closeSheet(){ UI.sheet = null; document.getElementById("sheetRoot").innerHTML = ""; }
// Veri değişince açık sayfa da tazelenir; ama form açıksa yazılanlar kaybolmasın diye formlar tazelenmez.
export function refreshSheet(){ if (UI.sheet && !UI.sheet.form) drawSheet(); }
export function drawSheet(){
  if (!UI.sheet) return;
  const fn = R.sheets[UI.sheet.type];
  const body = fn ? fn() : null;
  if (body == null){ closeSheet(); return; }
  const root = document.getElementById("sheetRoot");
  const prevScroll = root.querySelector(".sheet")?.scrollTop || 0;
  const fresh = !root.querySelector(".sheet");
  root.innerHTML = `<div class="scrim" data-act="scrim"><div class="sheet ${fresh ? "anim" : ""}" role="dialog" aria-modal="true">${body}</div></div>`;
  root.querySelector(".sheet").scrollTop = prevScroll;
  UI.sheet.onDraw?.();
}
