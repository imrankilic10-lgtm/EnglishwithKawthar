// Karşılama bandındaki küçük illüstrasyon: açık kitap, konuşma balonları, kalem, yıldızlar.
// Düz renkli, ince; daire/halka süsleme yok (kullanıcı istemedi).
const star = (x, y, s, fill) =>
  `<path d="M${x} ${y - s}Q${x + s * .18} ${y - s * .18} ${x + s} ${y}Q${x + s * .18} ${y + s * .18} ${x} ${y + s}Q${x - s * .18} ${y + s * .18} ${x - s} ${y}Q${x - s * .18} ${y - s * .18} ${x} ${y - s}Z" fill="${fill}"/>`;

export const welcomeArt = () => `<svg class="w-art" viewBox="0 0 280 190" aria-hidden="true">
  <!-- kitap kapağı -->
  <path d="M30 86 L30 166 Q84 152 140 168 Q196 152 250 166 L250 86 Q196 74 140 88 Q84 74 30 86Z" fill="#E6B596"/>
  <!-- sayfalar -->
  <path d="M38 80 L38 156 Q86 142 136 156 L136 82 Q86 66 38 80Z" fill="#FBF8F2"/>
  <path d="M144 82 L144 156 Q194 142 242 156 L242 80 Q194 66 144 82Z" fill="#F4EFE6"/>
  <path d="M140 84 L140 160" stroke="#D9CFE8" stroke-width="2"/>
  ${["M52 96 Q86 88 122 97", "M52 108 Q86 100 122 109", "M52 120 Q86 112 112 120", "M52 132 Q80 125 104 131",
     "M158 97 Q194 88 228 96", "M158 109 Q194 100 228 108", "M158 121 Q190 112 218 119"]
    .map(d => `<path d="${d}" fill="none" stroke="#D3C8E6" stroke-width="2.4" stroke-linecap="round"/>`).join("")}
  <!-- konuşma balonları -->
  <path d="M22 20 h88 a12 12 0 0 1 12 12 v18 a12 12 0 0 1-12 12 h-58 l-14 12 l2-12 h-18 a12 12 0 0 1-12-12 v-18 a12 12 0 0 1 12-12Z" fill="#F7C4E6"/>
  <text x="66" y="48" text-anchor="middle" font-family="Instrument Serif, Georgia, serif" font-style="italic" font-size="22" fill="#2F2650">Hello!</text>
  <path d="M168 36 h66 a10 10 0 0 1 10 10 v14 a10 10 0 0 1-10 10 h-12 l2 10 l-12-10 h-44 a10 10 0 0 1-10-10 v-14 a10 10 0 0 1 10-10Z" fill="#E6EDE4"/>
  <text x="201" y="59" text-anchor="middle" font-family="Geist, Segoe UI, sans-serif" font-weight="600" font-size="13" fill="#2F2650" letter-spacing="1">A · B · C</text>
  <!-- kalem -->
  <g transform="rotate(-38 236 150)">
    <rect x="196" y="144" width="62" height="12" rx="2" fill="#F2D27A"/>
    <rect x="252" y="144" width="12" height="12" rx="2" fill="#D8938B"/>
    <path d="M196 144 L182 150 L196 156Z" fill="#FBF8F2"/>
    <path d="M186 148.3 L182 150 L186 151.7Z" fill="#2F2650"/>
  </g>
  ${star(150, 18, 7, "#FBF8F2")}${star(262, 96, 6, "#F7C4E6")}${star(14, 112, 5, "#FBF8F2")}
</svg>`;
