// Dışa aktarımı Supabase'e yükler. Eski modeldeki (claude.ai) dosyayı önce yeni modele taşır (src/migrate.js).
//
//   npm run import-data -- --dry-run            # sadece taşı ve kontrol et, yazma
//   npm run import-data                         # en yeni dosyayı yükle (var olanları günceller)
//   npm run import-data -- --replace            # önce tüm tabloları boşalt, sonra yükle (son geçişte bunu kullan)
//   npm run import-data -- ../data/baska.json   # belirli bir dosya
//
// .env.local içinde VITE_SUPABASE_URL ve SUPABASE_SECRET_KEY gerekir.
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { COLLECTIONS, mappers } from "../src/data/mappers.js";
import { toV2 } from "../src/migrate.js";
import { loadMigrateOptions } from "./migrate-options.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run"), replace = args.includes("--replace");
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../../data");
// Varsayılan: en yeni claude.ai dışa aktarımı (v1). Taşıma her seferinde yeniden yapılır.
const file = args.find(a => !a.startsWith("--"))
  ?? join(dataDir, readdirSync(dataDir).filter(f => /^kawthar-veriler-[\d-]+\.json$/.test(f)).sort().pop() ?? "");

console.log(`Dosya: ${file}`);
const { data: dump, report, errors, summary } = toV2(JSON.parse(readFileSync(file, "utf8")), loadMigrateOptions(dataDir));
if (summary) { console.log("Eski model -> yeni model taşındı:"); console.table(summary); }
report.forEach(r => console.log("  · " + r));

// ---- satırlara çevir + tutarlılık kontrolü ----
const rows = {};
for (const col of COLLECTIONS) rows[col] = Object.entries(dump[col] || {}).map(([id, d]) => mappers[col].toRow(id, d));

const problems = errors.map(e => "HATA: " + e);
const ids = col => new Set(rows[col].map(r => r.id));
const classIds = ids("classes"), studentIds = ids("students"), enrIds = ids("enrollments");
for (const r of rows.enrollments){
  if (!studentIds.has(r.student_id)) problems.push(`HATA: ders kaydı ${r.id} olmayan kişiye bağlı (${r.student_id}).`);
  if (r.class_id && !classIds.has(r.class_id)) { problems.push(`Ders kaydı ${r.id}: ders ${r.class_id} yok, dersi boş bırakılacak.`); r.class_id = null; }
}
for (const r of rows.payments){
  if (!enrIds.has(r.enrollment_id)) problems.push(`HATA: ödeme ${r.id} olmayan ders kaydına bağlı (${r.enrollment_id}).`);
  if (!studentIds.has(r.student_id)) problems.push(`HATA: ödeme ${r.id} olmayan kişiye bağlı (${r.student_id}).`);
  if (!r.date) problems.push(`HATA: ödeme ${r.id} tarihsiz.`);
}
for (const col of ["events", "extras"]) for (const r of rows[col])
  if (!classIds.has(r.class_id)) problems.push(`HATA: ${col} ${r.id} olmayan derse bağlı (${r.class_id}).`);

for (const col of COLLECTIONS) console.log(`  ${col.padEnd(12)} ${rows[col].length}`);
problems.forEach(p => console.log("  ! " + p));
if (problems.some(p => p.startsWith("HATA"))) { console.error("Hatalar düzeltilmeden yükleme yapılmaz."); process.exit(1); }
if (dryRun) { console.log("Deneme modu: hiçbir şey yazılmadı."); process.exit(0); }

// ---- yükle ----
const url = process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error(".env.local içinde VITE_SUPABASE_URL ve SUPABASE_SECRET_KEY olmalı."); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

if (replace) {
  for (const col of [...COLLECTIONS].reverse()) {          // önce bağımlı tablolar
    const { error } = await sb.from(col).delete().neq("id", "");
    if (error) throw new Error(`${col} boşaltılamadı: ${error.message}`);
  }
  console.log("Tablolar boşaltıldı.");
}
for (const col of COLLECTIONS) {                            // önce bağımsız tablolar
  for (let i = 0; i < rows[col].length; i += 500) {
    const { error } = await sb.from(col).upsert(rows[col].slice(i, i + 500));
    if (error) throw new Error(`${col} yüklenemedi: ${error.message}`);
  }
  const { count, error } = await sb.from(col).select("id", { count: "exact", head: true });
  if (error) throw error;
  console.log(`  ✓ ${col.padEnd(12)} veritabanında ${count} kayıt`);
}
console.log("Tamam.");
