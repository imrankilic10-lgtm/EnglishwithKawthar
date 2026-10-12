// Demo arka ucu: sadece `npm run dev` sırasında, Supabase ayarı yoksa kullanılır.
// data/ klasöründeki en yeni dışa aktarımı belleğe yükler (eski modeldeyse yeni modele taşır);
// değişiklikler sayfa yenilenince kaybolur. Üretim derlemesine girmez (gerçek öğrenci verisi yayına çıkmasın).
import { COLLECTIONS } from "./mappers.js";
import { toV2 } from "../migrate.js";

export async function createLocalBackend(){
  const files = import.meta.glob("../../../data/kawthar-veriler-*.json", { import: "default" });
  const latest = Object.keys(files).sort().pop();
  // Taşımanın veriye özgü ayarları (varsa): data/tasima-ayarlari.json
  const cfg = Object.values(import.meta.glob("../../../data/tasima-ayarlari.json", { import: "default", eager: true }))[0] || {};
  const { data: seed, errors } = toV2(latest ? await files[latest]() : {}, { merges: cfg.merges || {}, partials: cfg.partials || {} });
  if (errors.length) console.error("Demo verisi taşınırken hata:", errors);
  const stores = Object.fromEntries(COLLECTIONS.map(c => [c, structuredClone(seed[c] || {})]));
  for (const c of COLLECTIONS) for (const [id, d] of Object.entries(stores[c])) stores[c][id] = { ...d, id };
  const listeners = Object.fromEntries(COLLECTIONS.map(c => [c, new Set()]));
  const emit = col => { const snap = { ...stores[col] }; listeners[col].forEach(fn => fn(snap)); };

  return {
    kind: "local",
    source: latest?.split("/").pop() || "boş",
    auth: null,
    subscribe(col, onData){ listeners[col].add(onData); queueMicrotask(() => onData({ ...stores[col] })); return () => listeners[col].delete(onData); },
    async save(col, id, data){ stores[col][id] = { ...structuredClone(data), id }; emit(col); },
    async remove(col, id){ delete stores[col][id]; emit(col); },
  };
}
