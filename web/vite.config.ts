import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// MediaPipe (Haltungserkennung im Trainer-Modus) liefern wir selbst aus, nicht
// von einem CDN: Die WASM-Dateien kommen versioniert aus node_modules nach
// /mediapipe/<version>/wasm/, das Modell lädt scripts/modell-laden.mjs nach public/.
const MEDIAPIPE_DIR = resolve(import.meta.dirname, 'node_modules/@mediapipe/tasks-vision')
const MEDIAPIPE_VERSION = JSON.parse(readFileSync(resolve(MEDIAPIPE_DIR, 'package.json'), 'utf8')).version as string
const MEDIAPIPE_PFAD = `/mediapipe/${MEDIAPIPE_VERSION}/wasm/`

function mediapipeWasm(): Plugin {
  const wasmDir = resolve(MEDIAPIPE_DIR, 'wasm')
  return {
    name: 'mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use(MEDIAPIPE_PFAD, (req, res, next) => {
        const datei = (req.url ?? '').split('?')[0].replace(/^\//, '')
        if (!readdirSync(wasmDir).includes(datei)) return next()
        res.setHeader('Content-Type', datei.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.end(readFileSync(resolve(wasmDir, datei)))
      })
    },
    generateBundle() {
      for (const datei of readdirSync(wasmDir)) {
        if (datei.includes('module_internal')) continue // ES-Modul-Variante nutzen wir nicht
        this.emitFile({ type: 'asset', fileName: `${MEDIAPIPE_PFAD.slice(1)}${datei}`, source: readFileSync(resolve(wasmDir, datei)) })
      }
    },
  }
}

// Web-App (PWA): installierbar auf Android und iOS („Zum Home-Bildschirm“).
export default defineConfig({
  define: { __MEDIAPIPE_PFAD__: JSON.stringify(MEDIAPIPE_PFAD) },
  plugins: [
    react(),
    mediapipeWasm(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registrierung in main.tsx, damit die App auch im Hintergrund regelmäßig nach Updates sucht
      injectRegister: false,
      includeAssets: ['favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Rückgrat Donaueschingen',
        short_name: 'Rückgrat',
        description: 'Dein Begleiter für Training, Rücken, Ernährung und Gesundheit – nach dem Five-Konzept.',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f5f1',
        theme_color: '#f7f5f1',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // PDF-Leser und Haltungserkennung nur bei Bedarf laden, nicht vorab cachen
        // Team-Werkzeuge (PDF, Word, Kamera-Erkennung) nur bei Bedarf laden, nicht bei jedem Mitglied vorab
        globIgnores: ['**/pdf*', '**/lib-*', '**/vision_bundle*', 'mediapipe/**'],
        navigateFallback: '/index.html',
        // Supabase-Anfragen (Daten, Login, Edge Functions) nie aus dem Cache
        runtimeCaching: [
          // Haltungserkennung (~25 MB) nach dem ersten Start lokal behalten
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/mediapipe/'),
            handler: 'CacheFirst',
            options: { cacheName: 'mediapipe', expiration: { maxEntries: 10 }, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
})
