// scripts/extract-site-assets.mjs
// Extracts and downloads high-res images, SVGs, videos, and media from any site
// Integrates with the scroll-driven website for dynamic asset replacement

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'public', 'assets', 'extracted');

fs.mkdirSync(outputDir, { recursive: true });

export async function extractAssetsFromUrl(targetUrl, maxAssets = 12) {
  console.log(`\n[REA Asset Extractor] Targeting: ${targetUrl}`);

  try {
    const urlObj = new URL(targetUrl);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    const res = await fetch(targetUrl, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch page: HTTP ${res.status} ${res.statusText}`);
    }

    const html = await res.text();
    console.log(`[REA Asset Extractor] Fetched HTML (${(html.length / 1024).toFixed(1)} KB). Scanning for media...`);

    const assetUrls = new Set();

    // 1. Match img src and data-src
    const imgMatches = html.matchAll(/<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["']/gi);
    for (const match of imgMatches) {
      if (match[1]) assetUrls.add(match[1]);
    }

    // 2. Match picture srcset
    const srcsetMatches = html.matchAll(/(?:srcset)=["']([^"']+)["']/gi);
    for (const match of srcsetMatches) {
      const candidates = match[1].split(',').map(s => s.trim().split(/\s+/)[0]);
      candidates.forEach(c => { if (c) assetUrls.add(c); });
    }

    // 3. Match video src and source
    const videoMatches = html.matchAll(/<(?:video|source)[^>]+src=["']([^"']+)["']/gi);
    for (const match of videoMatches) {
      if (match[1]) assetUrls.add(match[1]);
    }

    // 4. Match CSS background-image
    const bgMatches = html.matchAll(/url\(["']?([^"')]+)["']?\)/gi);
    for (const match of bgMatches) {
      if (match[1] && !match[1].startsWith('data:')) assetUrls.add(match[1]);
    }

    // 5. Match OpenGraph and Twitter images
    const metaMatches = html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/gi);
    for (const match of metaMatches) {
      if (match[1]) assetUrls.add(match[1]);
    }

    console.log(`[REA Asset Extractor] Found ${assetUrls.size} candidate media references.`);

    const validUrls = [];
    for (const rawUrl of assetUrls) {
      try {
        const resolved = new URL(rawUrl, urlObj.origin).href;
        // Filter out tracking pixels and common telemetry
        if (resolved.includes('analytics') || resolved.includes('pixel') || resolved.includes('tracking')) continue;
        const ext = path.extname(new URL(resolved).pathname).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp', '.svg', '.mp4', '.webm', '.gif', '.avif'].includes(ext) || resolved.includes('images') || resolved.includes('assets')) {
          validUrls.push(resolved);
        }
      } catch (_) {}
    }

    console.log(`[REA Asset Extractor] Filtered ${validUrls.length} valid media URLs. Downloading top ${maxAssets}...`);

    const downloaded = [];
    let count = 0;

    for (const mediaUrl of validUrls) {
      if (count >= maxAssets) break;
      try {
        const parsed = new URL(mediaUrl);
        let ext = path.extname(parsed.pathname) || '.jpg';
        if (ext.length > 5 || !ext) ext = '.jpg';
        const cleanName = `asset_${count + 1}_${path.basename(parsed.pathname, ext).replace(/[^a-z0-9_-]/gi, '_').slice(0, 20)}${ext}`;
        const savePath = path.join(outputDir, cleanName);

        const mediaRes = await fetch(mediaUrl, { headers });
        if (mediaRes.ok) {
          const buffer = Buffer.from(await mediaRes.arrayBuffer());
          // Ignore small tracking pixels < 2KB
          if (buffer.length > 2048) {
            fs.writeFileSync(savePath, buffer);
            const relativePath = `/assets/extracted/${cleanName}`;
            downloaded.push({
              name: cleanName,
              url: relativePath,
              source: mediaUrl,
              sizeBytes: buffer.length,
              type: ext.replace('.', '')
            });
            console.log(`  ✓ Downloaded [${(buffer.length / 1024).toFixed(1)} KB]: ${cleanName}`);
            count++;
          }
        }
      } catch (err) {
        console.warn(`  ✗ Failed to download ${mediaUrl}: ${err.message}`);
      }
    }

    // Write manifest
    const manifestPath = path.join(outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      targetUrl,
      extractedAt: new Date().toISOString(),
      count: downloaded.length,
      assets: downloaded
    }, null, 2));

    console.log(`[REA Asset Extractor] Extraction complete! ${downloaded.length} assets saved to public/assets/extracted/`);
    console.log(`[REA Asset Extractor] Manifest saved to public/assets/extracted/manifest.json\n`);

    return downloaded;
  } catch (err) {
    console.error(`[REA Asset Extractor Error]:`, err);
    throw err;
  }
}

// CLI execution
if (process.argv[2]) {
  extractAssetsFromUrl(process.argv[2]);
}
