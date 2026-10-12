// Eski (v1) dışa aktarımı yeni modele (v2) taşır ve yanına yazar. Hiçbir şeyi silmez, kaynak dosyaya dokunmaz.
//
//   npm run migrate-data                          # en yeni v1 dosyası -> aynı ad + .v2.json
//   npm run migrate-data -- ../data/dosya.json
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateV1toV2, isV2 } from "../src/migrate.js";
import { loadMigrateOptions } from "./migrate-options.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../../data");
const file = process.argv.slice(2).find(a => !a.startsWith("--"))
  ?? join(dataDir, readdirSync(dataDir).filter(f => /^kawthar-veriler-[\d-]+\.json$/.test(f)).sort().pop() ?? "");

const dump = JSON.parse(readFileSync(file, "utf8"));
if (isV2(dump)) { console.log(`${file} zaten yeni modelde.`); process.exit(0); }

const { data, report, errors, summary } = migrateV1toV2(dump, loadMigrateOptions(dataDir));
console.log(`Kaynak: ${file}`);
console.table(summary);
report.forEach(r => console.log("  · " + r));
if (errors.length) { errors.forEach(e => console.error("  ! " + e)); console.error("Hatalar var, dosya yazılmadı."); process.exit(1); }

const out = file.replace(/\.json$/, ".v2.json");
writeFileSync(out, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`Yazıldı: ${out}`);
