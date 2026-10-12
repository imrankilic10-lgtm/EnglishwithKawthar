// Taşımanın veriye özgü ayarları: data/tasima-ayarlari.json (gerçek veriyle birlikte durur, depoya girmez).
// Biçim için bkz. src/migrate.js başı.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function loadMigrateOptions(dataDir){
  const f = join(dataDir, "tasima-ayarlari.json");
  if (!existsSync(f)){
    console.warn("Uyarı: data/tasima-ayarlari.json yok; kişi birleştirme ve kısmi ödeme ayarları uygulanmadı.");
    return {};
  }
  const { merges = {}, partials = {} } = JSON.parse(readFileSync(f, "utf8"));
  return { merges, partials };
}
