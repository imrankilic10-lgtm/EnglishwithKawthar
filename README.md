# English with Kawthar — yönetim paneli

Bir İngilizce kursunun dersleri, ödemeleri ve hocalarının takibi için basit, telefondan da kullanılabilen bir yönetim uygulaması.

- **Bugün:** sıradaki ders, günün yapılacakları (hatırlatma, ödeme alma, hocaya pay gönderme), ayın tahsilat özeti
- **Öğrenciler, ders programı, ödemeler** (liste ve aylık tablo), **notlar, hocalar, ayarlar**
- Ödeme takibi her öğrencinin kendi döngüsüne göre (aylık, haftalık, paket), kısmi ödeme desteği
- Hoca payları ve kurs sahibinin net kazancı otomatik hesaplanır

## Yapı

| Klasör | İçerik |
|---|---|
| `web/` | Uygulama (Vite + vanilla JS). `src/domain.js` iş kuralları, `src/views/` ekranlar, `src/sheets/` açılan paneller |
| `supabase/schema.sql` | Veritabanı tabloları, giriş izni (sadece izinli e-postalar) ve satır düzeyi güvenlik |
| `app/` | İlk sürüm (claude.ai üzerinde çalışan tek dosya) |
| `netlify.toml` | Netlify yayın ayarları |

## Çalıştırma

```bash
cd web
npm install
npm run dev
```

Üretim için `web/.env.example` dosyasını `web/.env.local` olarak kopyalayıp Supabase anahtarlarını girin. Netlify'da sadece `VITE_SUPABASE_URL` ve `VITE_SUPABASE_PUBLISHABLE_KEY` tanımlanır; gizli anahtar asla tarayıcıya ya da Netlify'a girilmez.

Gerçek öğrenci verileri bu depoda yer almaz.
