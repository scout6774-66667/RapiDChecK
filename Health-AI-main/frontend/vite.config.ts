import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'mascots/*.png'],
      manifest: {
        name: 'RuralHealth AI — Disease Risk Prediction',
        short_name: 'RuralHealth AI',
        description: 'AI-powered early disease risk prediction and rural health access system',
        theme_color: '#4f46e5',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/favicon.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/favicon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: new RegExp('^https://unpkg\\.com/.*$'),
            handler: 'CacheFirst',
            options: { cacheName: 'cdn-cache', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 } }
          },
          {
            urlPattern: new RegExp('^https://fonts\\.googleapis\\.com/.*$'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts' }
          },
          {
            urlPattern: new RegExp('^https://nominatim\\.openstreetmap\\.org/.*$'),
            handler: 'NetworkFirst',
            options: { cacheName: 'nominatim-geocode', networkTimeoutSeconds: 5, expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 } }
          },
          {
            urlPattern: new RegExp('^https://overpass-api\\.de/.*$'),
            handler: 'NetworkFirst',
            options: { cacheName: 'overpass-hospitals', networkTimeoutSeconds: 8, expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 } }
          },
          {
            urlPattern: new RegExp('/api/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', networkTimeoutSeconds: 3, expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 } }
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
