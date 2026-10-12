// Supabase arka ucu: giriş + tablolar + canlı güncelleme.
import { createClient } from "@supabase/supabase-js";
import { COLLECTIONS, mappers } from "./mappers.js";

const PAGE = 1000;

export function createSupabaseBackend(url, key){
  const sb = createClient(url, key);
  const stores = {}, listeners = {}, errListeners = {};
  COLLECTIONS.forEach(c => { listeners[c] = new Set(); errListeners[c] = new Set(); });
  const emit = col => { const snap = {...stores[col]}; listeners[col].forEach(fn => fn(snap)); };

  async function load(col){
    const rows = [];
    for (let from = 0; ; from += PAGE){
      const { data, error } = await sb.from(col).select("*").order("id").range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    stores[col] = Object.fromEntries(rows.map(r => [r.id, mappers[col].fromRow(r)]));
    emit(col);
  }
  async function loadAll(){
    await Promise.all(COLLECTIONS.map(col => load(col).catch(err => errListeners[col].forEach(fn => fn(err)))));
  }

  let channel = null;
  function start(){
    if (channel) return;
    loadAll();
    let first = true;
    channel = sb.channel("kawthar-db");
    COLLECTIONS.forEach(col => channel.on("postgres_changes", { event: "*", schema: "public", table: col }, payload => {
      if (!stores[col]) return;
      if (payload.eventType === "DELETE") delete stores[col][payload.old.id];
      else stores[col][payload.new.id] = mappers[col].fromRow(payload.new);
      emit(col);
    }));
    // Bağlantı koptuktan sonra yeniden kurulunca aradaki değişiklikleri kaçırmamak için baştan oku.
    channel.subscribe(status => { if (status === "SUBSCRIBED"){ if (!first) loadAll(); first = false; } });
    // Telefon uykudan uyanınca da tazele.
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") loadAll(); });
  }

  const normalize = e => {
    const err = new Error(e?.message || "db error");
    err.code = e?.code === "42501" || e?.status === 401 || e?.status === 403 ? "forbidden" : (e?.code || "unknown");
    return err;
  };

  return {
    kind: "supabase",
    auth: {
      async session(){ const { data } = await sb.auth.getSession(); return data.session; },
      async signIn(email, password){ const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; },
      async signOut(){ await sb.auth.signOut(); },
      async updatePassword(password){ const { error } = await sb.auth.updateUser({ password }); if (error) throw error; },
      onSignedOut(fn){ sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") fn(); }); },
      async profile(){
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return null;
        const { data } = await sb.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
        return { email: user.email, ...(data || {}) };
      },
    },
    subscribe(col, onData, onError){
      listeners[col].add(onData); if (onError) errListeners[col].add(onError);
      start();
      if (stores[col]) onData({...stores[col]});
      return () => { listeners[col].delete(onData); errListeners[col].delete(onError); };
    },
    async save(col, id, data){
      const row = mappers[col].toRow(id, data);
      const { data: saved, error } = await sb.from(col).upsert(row).select().single();
      if (error) throw normalize(error);
      if (stores[col]){ stores[col][id] = mappers[col].fromRow(saved); emit(col); }
    },
    async remove(col, id){
      const { error } = await sb.from(col).delete().eq("id", id);
      if (error) throw normalize(error);
      if (stores[col]){ delete stores[col][id]; emit(col); }
    },
  };
}
