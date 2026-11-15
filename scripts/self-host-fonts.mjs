// scripts/self-host-fonts.mjs
// Downloads the Google Fonts used by the site into public/fonts/ and emits a
// fonts.css with local @font-face rules, so the page no longer blocks on
// fonts.googleapis.com. Only latin / latin-ext subsets are kept (the copy is
// English).
//
//   node scripts/self-host-fonts.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'public', 'fonts');

const FAMILIES = [
  { family: 'JetBrains Mono', weights: '300;400;500;700', slug: 'jetbrains-mono' },
  { family: 'Space Grotesk', weights: '300;400;500;600;700', slug: 'space-grotesk' },
  { family: 'Syne', weights: '500;700;800;900', slug: 'syne' },
];

const KEEP_SUBSETS = new Set(['latin', 'latin-ext']);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function splitFontFaces(css) {
  const faces = [];
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/gi;
  let match;
  while ((match = re.exec(css)) !== null) {
    faces.push({ subset: match[1].trim(), body: match[2] });
  }
  return faces;
}

function field(body, name) {
  const m = body.match(new RegExp(`${name}:\\s*([^;]+);`, 'i'));
  return m ? m[1].trim() : '';
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const cssChunks = [];
  const byUrl = new Map();

  for (const { family, weights, slug } of FAMILIES) {
    const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weights}&display=swap`;
    const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();

    let kept = 0;
    for (const face of splitFontFaces(css)) {
      if (!KEEP_SUBSETS.has(face.subset)) continue;

      const weight = field(face.body, 'font-weight');
      const srcMatch = face.body.match(/url\((https:\/\/[^)]+\.woff2)\)/);
      if (!srcMatch) continue;

      // Google serves one variable-font file per family+subset for every
      // weight: download it once and point all the faces at it.
      let file = byUrl.get(srcMatch[1]);
      if (!file) {
        file = `${slug}-${face.subset}.woff2`;
        const dest = path.join(outDir, file);
        if (!fs.existsSync(dest)) {
          const buf = Buffer.from(await (await fetch(srcMatch[1])).arrayBuffer());
          fs.writeFileSync(dest, buf);
        }
        byUrl.set(srcMatch[1], file);
      }

      const unicodeRange = field(face.body, 'unicode-range');
      cssChunks.push(
        `/* ${family} ${weight} ${face.subset} */\n` +
          `@font-face {\n` +
          `  font-family: '${family}';\n` +
          `  font-style: normal;\n` +
          `  font-weight: ${weight};\n` +
          `  font-display: swap;\n` +
          `  src: url('/fonts/${file}') format('woff2');\n` +
          (unicodeRange ? `  unicode-range: ${unicodeRange};\n` : '') +
          `}`
      );
      kept++;
    }
    console.log(`[fonts] ${family}: kept ${kept} faces`);
  }

  fs.writeFileSync(path.join(outDir, 'fonts.css'), cssChunks.join('\n') + '\n');
  const total = fs.readdirSync(outDir).reduce((n, f) => n + fs.statSync(path.join(outDir, f)).size, 0);
  console.log(`[fonts] wrote ${path.relative(projectRoot, outDir)} (${(total / 1024).toFixed(0)} KB total)`);
}

main().catch((error) => {
  console.error('[fonts] failed:', error);
  process.exitCode = 1;
});