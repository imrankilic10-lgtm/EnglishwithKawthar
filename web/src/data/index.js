// Tek veri katmanı. Arayüz sadece şunları kullanır:
//   db.subscribe(col, onData, onError)  -> onData({ id: {...doc, id} })
//   db.save(col, id, data)              -> hata olursa throw (yetki yoksa err.code === "forbidden")
//   db.remove(col, id)
//   db.auth                             -> giriş işlemleri (demo modunda null)
import { createSupabaseBackend } from "./supabase.js";

export async function openData(){
  // Paylaşım (önizleme) sürümü: veriler sayfayla gelir, değişiklikler kaydedilmez. Bkz. npm run build:share
  if (import.meta.env.VITE_DEMO === "1"){ const { createLocalBackend } = await import("./local.js"); return createLocalBackend(); }
  const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) return createSupabaseBackend(url, key);
  if (import.meta.env.DEV){ const { createLocalBackend } = await import("./local.js"); return createLocalBackend(); }
  return null;
}
