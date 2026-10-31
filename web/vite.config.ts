import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Web-App (PWA): installierbar auf Android und iOS („Zum Home-Bildschirm“).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Rückgrat Donaueschingen',
        short_name: 'Rückgrat',
        description: 'Dein Begleiter für Training, Rücken, Ernährung und Gesundheit – nach dem Five-Konzept.',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#121212',
        theme_color: '#121212',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // PDF-Leser nur bei Bedarf laden, nicht vorab cachen
        globIgnores: ['**/pdf.worker*'],
        navigateFallback: '/index.html',
        // Supabase-Anfragen (Daten, Login, Edge Functions) nie aus dem Cache
        runtimeCaching: [],
      },
    }),
  ],
})
