import { defineConfig } from 'vite';

const siteUrl = (process.env.SITE_URL || '').replace(/\/+$/, '');

/**
 * Injects the deployment origin into the document head.
 *  - SITE_URL set   -> canonical / og:url / og:image become absolute URLs
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
