import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const api = { '/api': { target: 'http://localhost:8787', changeOrigin: false } };

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon-180x180.png', 'favicon.svg'],
      manifest: {
        name: 'SPLAV',
        short_name: 'SPLAV',
        description: 'Дневник гибридных тренировок: сила, кардио и комплексы в одном месте',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFFFFF',
        theme_color: '#15181E',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,csv}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Иллюстрации упражнений (RepDB) не входят в precache: их больше тысячи. Кэшируются при первом просмотре.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/media/repdb/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'repdb-media',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5173, proxy: api },
  preview: { port: 4173, proxy: api, allowedHosts: true },
});
