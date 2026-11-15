import { defineConfig } from 'vite';

const siteUrl = (process.env.SITE_URL || '').replace(/\/+$/, '');

// Chapter routes mirrored in the generated sitemap.
const CHAPTER_ROUTES = [
  '/',
  '/#hero',
  '/#aperture-section',
  '/#horizontal-section',
  '/#stack-section',
  '/#telemetry-section',
  '/#console-section',
  '/#cta-section',
];

function robotsTxt() {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

function sitemapXml() {
  const entries = CHAPTER_ROUTES.map(
    (route) =>
      `  <url>\n    <loc>${siteUrl}${route}</loc>\n    <changefreq>monthly</changefreq>\n  </url>`
  ).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * Injects the deployment origin into the document head.
 *  - SITE_URL set   -> canonical / og:url / og:image become absolute URLs,
 *                      plus robots.txt and sitemap.xml are emitted
 *  - SITE_URL unset -> canonical + og:url are dropped, images stay root-relative
 */
function siteUrlPlugin() {
  return {
    name: 'aether-site-url',
    transformIndexHtml(html) {
      const out = html.replaceAll('__SITE_URL__', siteUrl);
      if (siteUrl) return out;
      return out.replace(/^\s*<(meta|link)[^>]*data-site-url-only[^>]*>\s*$/gm, '');
    },
    generateBundle() {
      if (!siteUrl) return;
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt() });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml() });
    },
  };
}

export default defineConfig({
  plugins: [siteUrlPlugin()],
  build: {
    target: 'es2020',
    cssTarget: 'chrome90',
    assetsInlineLimit: 2048,
    chunkSizeWarningLimit: 120,
    rollupOptions: {
      output: {
        // Rolldown expects the callback form.
        manualChunks(id) {
          if (id.includes('node_modules/lenis')) return 'lenis';
          return undefined;
        },
      },
    },
  },
});
