// scripts/optimize-images.mjs
// Converts the source photography into responsive AVIF/WebP variants plus a
// slimmed progressive JPEG fallback, then drops the originals in place.
//
//   node scripts/optimize-images.mjs
//
// Output per public/assets/<name>.jpg:
//   public/assets/<name>-{640,1024,1440,1920}.avif
//   public/assets/<name>-{640,1024,1440,1920}.webp
//   public/assets/<name>.jpg   (optimised fallback, max 1920px wide)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const assetDir = path.join(projectRoot, 'public', 'assets');

const WIDTHS = [640, 1024, 1440, 1920];
const AVIF = { quality: 50, effort: 6 };
const WEBP = { quality: 74 };
const JPEG = { quality: 74, progressive: true, mozjpeg: true };

const fmt = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

async function optimise() {
  const files = fs.readdirSync(assetDir).filter((f) => f.endsWith('.jpg'));
  if (!files.length) {
    console.log('[assets] no source jpegs found');
    return;
  }

  let before = 0;
  let after = 0;

  for (const file of files) {
    const src = path.join(assetDir, file);
    const base = path.basename(file, '.jpg');
    const { width: sourceWidth, height: sourceHeight } = await sharp(src).metadata();

    const widths = WIDTHS.filter((w) => w < sourceWidth);
    widths.push(Math.min(sourceWidth, 1920));
    const unique = [...new Set(widths)].sort((a, b) => a - b);

    before += fs.statSync(src).size;

    for (const w of unique) {
      const pipeline = () => sharp(src).resize({ width: w, withoutEnlargement: true });
      await pipeline().avif(AVIF).toFile(path.join(assetDir, `${base}-${w}.avif`));
      await pipeline().webp(WEBP).toFile(path.join(assetDir, `${base}-${w}.webp`));
    }

    // Optimised in-place fallback for browsers without WebP/AVIF.
    const fallback = path.join(assetDir, `${base}.jpg`);
    const tmp = path.join(assetDir, `${base}.fallback.jpg`);
    await sharp(src)
      .resize({ width: Math.min(sourceWidth, 1920), withoutEnlargement: true })
      .jpeg(JPEG)
      .toFile(tmp);
    fs.renameSync(tmp, fallback);
    after += fs.statSync(fallback).size;

    console.log(
      `[assets] ${file} ${sourceWidth}x${sourceHeight} -> widths ${unique.join(', ')} | ` +
        `fallback ${fmt(fs.statSync(fallback).size)}`
    );
  }

  console.log(`\n[assets] fallback payload ${fmt(before)} -> ${fmt(after)}`);
}

optimise().catch((error) => {
  console.error('[assets] failed:', error);
  process.exitCode = 1;
});
