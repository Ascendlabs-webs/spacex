// scripts/generate-og-image.mjs
// Builds the 1200x630 social preview card from the existing photography.
//
//   node scripts/generate-og-image.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const assetDir = path.join(projectRoot, 'public', 'assets');
const outFile = path.join(projectRoot, 'public', 'og-image.jpg');

const WIDTH = 1200;
const HEIGHT = 630;

const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="#0e1128" stop-opacity="0.92"/>
      <stop offset="55%" stop-color="#0e1128" stop-opacity="0.62"/>
      <stop offset="100%" stop-color="#0e1128" stop-opacity="0.95"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#f0c987" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="#f0c987" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#shade)"/>
  <circle cx="880" cy="200" r="260" fill="url(#glow)"/>
  <g fill="none" stroke="#f0c987" stroke-opacity="0.85">
    <circle cx="880" cy="200" r="92" stroke-width="4" stroke-dasharray="430 148" transform="rotate(-30 880 200)"/>
    <circle cx="880" cy="200" r="124" stroke-width="2" stroke-opacity="0.35"/>
    <circle cx="880" cy="200" r="62" stroke-width="1.5" stroke-opacity="0.3"/>
  </g>
  <circle cx="880" cy="200" r="14" fill="#f0c987" fill-opacity="0.85"/>
  <text x="80" y="300" font-family="Syne, Arial Black, Arial, sans-serif" font-size="92" font-weight="800" fill="#f4f1ea" letter-spacing="6">AETHER</text>
  <text x="82" y="352" font-family="Space Grotesk, Arial, sans-serif" font-size="27" fill="#f0c987" letter-spacing="1.5">INTELLIGENCE AT THE EDGE OF SPACE</text>
  <text x="82" y="470" font-family="JetBrains Mono, Consolas, monospace" font-size="18" fill="#a7a5b8" letter-spacing="2">A SCROLL-DRIVEN FIELD STUDY · 07 CHAPTERS</text>
  <rect x="80" y="500" width="180" height="3" fill="#f0c987" fill-opacity="0.8"/>
</svg>`;

async function build() {
  const source = path.join(assetDir, 'nasa-carina-nebula-1920.webp');
  if (!fs.existsSync(source)) {
    console.error(`[og] missing ${source} — run scripts/optimize-images.mjs first`);
    process.exitCode = 1;
    return;
  }

  const overlayBuffer = Buffer.from(overlay);

  await sharp(source)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
    .modulate({ saturation: 0.85, brightness: 0.92 })
    .composite([{ input: overlayBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 84, progressive: true, mozjpeg: true })
    .toFile(outFile);

  console.log(`[og] wrote ${path.relative(projectRoot, outFile)} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
}

build().catch((error) => {
  console.error('[og] failed:', error);
  process.exitCode = 1;
});
