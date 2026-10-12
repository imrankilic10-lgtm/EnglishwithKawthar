// Giriş noktası: modülleri kaydeder, veriye bağlanır, ekranı çizer, olayları dağıtır.
import "./style.css";
import { openData } from "./data/index.js";
import { COLLECTIONS } from "./data/mappers.js";
import { S, D, R, ctx, UI, register, setRenderer, scheduleRender, closeSheet, toast } from "./app.js";
import { fmtDateLong } from "./lib/dates.js";
import { esc } from "./lib/format.js";
import { welcomeArt } from "./illustration.js";

import * as dashboard from "./views/dashboard.js";
import * as students from "./views/students.js";
import * as program from "./views/program.js";
import * as payments from "./views/payments.js";
import * as teachers from "./views/teachers.js";
import * as settings from "./views/settings.js";
import * as notes from "./views/notes.js";
import * as studentSheets from "./sheets/students.js";
import * as paymentSheets from "./sheets/payments.js";
import * as lessonSheets from "./sheets/lessons.js";
import * as classSheets from "./sheets/classes.js";
import * as quickSheets from "./sheets/quick.js";
import * as notebooks from "./views/notebooks.js";

const $ = s => document.querySelector(s);
[dashboard, students, program, payments, notes, notebooks, teachers, settings, studentSheets, paymentSheets, lessonSheets, classSheets, quickSheets].forEach(register);

try { const t = localStorage.getItem("kw_tab"); if (t && R.views[t]) S.tab = t; } catch(e) {}

// ---------- çizim ----------
// Sayfanın üstündeki küçük etiket (Bugün ekranında yok; orada karşılama bandı var).
const PAGES = { ozet: "", ogrenciler: "Kayıtlar", program: "Haftalık plan", odemeler: "Tahsilat", notlar: "Defter", defterler: "Satış", hocalar: "Ekip", ayarlar: "Sistem" };
function render(){
  document.querySelectorAll(".todayLbl").forEach(el => { el.textContent = fmtDateLong(D.today()); });
  document.querySelectorAll("[data-tab]").forEach(b => { if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (S.loaded.size < COLLECTIONS.length) return;
  R.beforeRender.forEach(fn => fn());
  const app = $("#app");
  const keepScroll = $(".pg-scroll")?.scrollLeft;
  const focusId = document.activeElement?.id;
  const selStart = document.activeElement?.selectionStart;
  const label = PAGES[S.tab];
  app.innerHTML = (label ? `<p class="kicker">${label}</p>` : "") + (R.views[S.tab] || R.views.ozet)();
  if (keepScroll && $(".pg-scroll")) $(".pg-scroll").scrollLeft = keepScroll;
  const el = focusId && document.getElementById(focusId);
  if (el && app.contains(el)){ el.focus(); if ((el.type === "search" || el.tagName === "TEXTAREA") && selStart != null) el.setSelectionRange(selStart, selStart); }
}
setRenderer(render);

// ---------- olaylar ----------
document.addEventListener("click", async e => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const a = t.dataset.act;
  if (a === "scrim"){ if (e.target === t) closeSheet(); return; }
  if (a === "close"){ closeSheet(); return; }
  if (a === "signOut"){ ctx.db?.auth?.signOut(); return; }
  if (a === "menu"){ document.body.classList.toggle("menu-open"); return; }
  document.body.classList.remove("menu-open");
  const fn = R.actions[a]; if (!fn) return;
  await fn(t, e);
  if (!UI.sheet || !t.closest(".sheet")) render();
});
document.addEventListener("change", async e => {
  const fn = R.changes[e.target.dataset?.change]; if (!fn) return;
  if (await fn(e.target, e) === true) render();
});
document.addEventListener("input", async e => {
  const fn = R.inputs[e.target.dataset?.input]; if (!fn) return;
  if (await fn(e.target, e) === true) render();
});
document.addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target;
  let failed = false;
  const show = m => { const x = f.querySelector("#formErr") || $("#formErr"); if (x){ x.textContent = m; if (m) x.scrollIntoView({ block: "nearest" }); } };
  const err = m => { failed = true; show(m); };
  const btn = f.querySelector("button[type=submit]");
  if (btn?.disabled) return;
  if (btn) btn.disabled = true;
  try { show(""); await R.submits[f.id]?.(f, err); }
  finally { if (btn && btn.isConnected) btn.disabled = false; }
  // Hata varsa ekranı yeniden çizme: sayfa içi formlarda (Notlar, Ayarlar) hata mesajı silinmesin.
  if (!failed) render();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape"){ if (UI.sheet) closeSheet(); else document.body.classList.remove("menu-open"); }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[role=button][data-act]")){ e.preventDefault(); e.target.click(); }
  // Ctrl/Cmd + Enter: içinde bulunulan formu kaydet (ör. not yazarken)
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.form){ e.preventDefault(); e.target.form.requestSubmit(); }
});
// Sayfa geçişi: yan menü (masaüstü / kayan menü) ve alt menü (telefon) aynı düğmeleri kullanır.
document.addEventListener("click", e => {
  const b = e.target.closest("[data-tab]"); if (!b) return;
  S.tab = b.dataset.tab;
  try { localStorage.setItem("kw_tab", S.tab); } catch(_) {}
  document.body.classList.remove("menu-open");
  render(); window.scrollTo(0, 0);
});

// ---------- giriş ----------
// Geliştirme sırasında giriş ekranını Supabase olmadan görmek için: http://localhost:5173/?giris
const LOGIN_PREVIEW = import.meta.env.DEV && new URLSearchParams(location.search).has("giris");

async function boot(){
  ctx.db = await openData();
  if (!ctx.db){ $("#app").innerHTML = `<div class="panel empty">Veri bağlantısı ayarlanmamış. Yöneticiye haber ver.</div>`; return; }
  if (ctx.db.kind === "local"){
    $("#demoBar").hidden = false;
    if (import.meta.env.VITE_SHARE === "1") $("#demoBar").textContent = "Önizleme sürümü: yapılan değişiklikler kaydedilmez, sayfa yenilenince geri döner.";
  }
  if (LOGIN_PREVIEW) return showLogin();
  if (ctx.db.auth){
    ctx.db.auth.onSignedOut(() => location.reload());
    if (!(await ctx.db.auth.session())) return showLogin();
  }
  await enter();
}
// Oturum açıkken: yetkiyi kontrol et, verilere bağlan.
async function enter(){
  if (ctx.db.auth){
    const prof = await ctx.db.auth.profile();
    S.user = prof;
    if (prof?.role !== "admin") return showNoAccess(prof);
  }
  document.body.classList.remove("login-mode");
  document.body.classList.add("authed");
  $("#app").innerHTML = `<div class="panel empty">Veriler yükleniyor…</div>`;
  for (const col of COLLECTIONS){
    ctx.db.subscribe(col, m => { S[col] = m; S.loaded.add(col); scheduleRender(); },
      () => { S.loaded.add(col); toast("Veriler okunamadı. Sayfayı yenile."); scheduleRender(); });
  }
}
// Giriş ve yetki ekranları: solda marka paneli, sağda form. Yan menü / alt menü gizli.
function authShell(inner){
  document.body.classList.remove("authed");
  document.body.classList.add("login-mode");
  $("#app").innerHTML = `<section class="auth">
    <div class="auth-brand">
      <img class="auth-logo" src="brand/logo-light.png" alt="English with Kawthar" width="818" height="572">
      <div><h2 class="auth-title">Kursun her günü,<br><em>tek ekranda.</em></h2>
        <p class="auth-say">Dersler, yoklama istisnaları, ödemeler ve notlar. Telefondan da.</p></div>
      ${welcomeArt()}
    </div>
    <div class="auth-side"><div class="auth-form">${inner}</div></div>
  </section>`;
}
function showLogin(){
  authShell(`<p class="kicker">Yönetim paneli</p>
    <h2 class="auth-h">Hoş geldiniz</h2>
    <p class="hint auth-lead">Devam etmek için hesabınızla giriş yapın.</p>
    <form id="loginForm" class="stack" novalidate>
      <label class="f">E-posta<input id="l_email" type="email" autocomplete="username" inputmode="email" required placeholder="ornek@eposta.com"></label>
      <label class="f">Şifre<span class="pw"><input id="l_pass" type="password" autocomplete="current-password" required>
        <button type="button" class="pw-t" data-act="pwToggle" aria-label="Şifreyi göster" aria-pressed="false">Göster</button></span></label>
      <div id="formErr" class="err" role="alert"></div>
      <button class="btn pri auth-btn" type="submit">Giriş yap</button>
    </form>
    <p class="hint auth-help">Şifreni mi unuttun? İmran'a yaz, yenisini göndersin.</p>
    ${LOGIN_PREVIEW ? `<p class="banner">Önizleme: giriş, Supabase kurulunca çalışacak. <a href="/">Uygulamaya dön</a></p>` : ""}`);
  setTimeout(() => $("#l_email")?.focus(), 0);
}
function showNoAccess(prof){
  authShell(`<p class="kicker">Yönetim paneli</p>
    <h2 class="auth-h">Yetki bekleniyor</h2>
    <p class="hint auth-lead">${esc(prof?.email || "Bu hesap")} ile giriş yapıldı ama henüz bu uygulamayı kullanma yetkisi tanımlanmadı. Yöneticiye haber ver.</p>
    <div><button class="btn" data-act="signOut">Çıkış yap</button></div>`);
}
R.actions.pwToggle = t => {
  const input = $("#l_pass"); const show = input.type === "password";
  input.type = show ? "text" : "password";
  t.textContent = show ? "Gizle" : "Göster"; t.setAttribute("aria-pressed", String(show)); t.setAttribute("aria-label", show ? "Şifreyi gizle" : "Şifreyi göster");
};
R.submits.loginForm = async (f, err) => {
  const email = $("#l_email").value.trim(), pass = $("#l_pass").value;
  if (!email || !pass) return err("E-posta ve şifreni yaz.");
  if (!ctx.db.auth) return err("Önizleme: giriş, Supabase kurulunca çalışacak.");
  try { await ctx.db.auth.signIn(email, pass); }
  catch(e){ return err(e?.code === "invalid_credentials" ? "E-posta ya da şifre hatalı." : "Giriş yapılamadı. İnternet bağlantını kontrol edip tekrar dene."); }
  await enter();
};

render();
boot();
// Saat ilerledikçe "bugün", "gecikti" gibi durumlar tazelensin; açık bir form varsa bozma.
setInterval(() => { if (!UI.sheet?.form) scheduleRender(); }, 5 * 60 * 1000);
