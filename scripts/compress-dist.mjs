// scripts/compress-dist.mjs
// Pre-compresses the built site with gzip and brotli so static hosts can
// serve the compressed variants directly. Images are skipped: they are
// already compressed.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist');

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.xml', '.txt', '.webmanifest']);
const MIN_BYTES = 1024;

async function walk(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

async function compress() {
  if (!fs.existsSync(distDir)) {
    console.log('[compress] no dist directory — run the build first');
    return;
  }

  const files = await walk(distDir);
  let original = 0;
  let gzipTotal = 0;
  let brotliTotal = 0;

  for (const file of files) {
    if (!COMPRESSIBLE.has(path.extname(file).toLowerCase())) continue;
    const data = fs.readFileSync(file);
    if (data.length < MIN_BYTES) continue;

    const gz = await gzip(data, { level: 9 });
    const br = await brotli(data, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length },
    });

    fs.writeFileSync(`${file}.gz`, gz);
    fs.writeFileSync(`${file}.br`, br);

    original += data.length;
    gzipTotal += gz.length;
    brotliTotal += br.length;
  }

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`[compress] raw ${kb(original)} -> gzip ${kb(gzipTotal)} -> brotli ${kb(brotliTotal)}`);
}

compress().catch((error) => {
  console.error('[compress] failed:', error);
  process.exitCode = 1;
});
