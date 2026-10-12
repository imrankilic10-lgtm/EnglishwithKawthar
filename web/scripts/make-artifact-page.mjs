// dist-share/index.html -> dist-share/artifact.html
// claude.ai Artifact sayfası kendi <html>/<head>/<body> sarmalını ekler; bu yüzden sayfayı sarmalsız yazarız:
// <title>, yazı tipi ve stil bağlantıları, gövde içeriği, modül betikleri. Yollar göreli kalır (assets/..., brand/...).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] || "dist-share";
const html = readFileSync(join(dir, "index.html"), "utf8");
const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? "";
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";

const keep = [...head.matchAll(/<link\b[^>]*>/gi)].map(m => m[0])
  .filter(tag => !/rel="(icon|apple-touch-icon)"/i.test(tag));          // sekme ikonu Artifact'ın kendi ayarından gelir
const scripts = [...head.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map(m => m[0]);

const page = [
  "<title>Kawthar Yönetim Paneli</title>",
  ...keep,
  body.trim(),
  ...scripts,
].join("\n") + "\n";

writeFileSync(join(dir, "artifact.html"), page, "utf8");
console.log(`artifact.html yazıldı (${page.length} bayt), ${keep.length} bağlantı, ${scripts.length} betik`);
