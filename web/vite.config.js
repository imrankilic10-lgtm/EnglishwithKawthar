import { defineConfig } from "vite";

export default defineConfig({
  // Demo modu ../data klasöründeki dışa aktarımı okuyabilsin diye (sadece geliştirme sunucusu).
  server: { fs: { allow: [".."] } },
  // PDF araçları (jsPDF + html2canvas) ayrı ve tembel yüklenen bir pakette; büyük olması açılışı etkilemez.
  build: { chunkSizeWarningLimit: 700 },
});
