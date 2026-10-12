import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { Agent } from 'node:http';

// Puertos propios para no chocar con otros proyectos: frontend 5181, API 3100
export default defineConfig({
  plugins: [
    react(),
    // App instalable (PWA): la interfaz queda guardada en el equipo y las consultas recientes se pueden ver sin conexión
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['iconos/favicon-64.png', 'iconos/apple-touch-icon.png'],
      manifest: {
        name: 'Control de Vacunación · MSPAS San Luis Jilotepeque',
        short_name: 'Vacunación',
        description: 'Registro nominal, seguimiento del esquema y jornadas de vacunación infantil del Centro de Salud de San Luis Jilotepeque, Jalapa.',
        lang: 'es-GT',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#1b2a5c',
        background_color: '#f3f6fa',
        categories: ['medical', 'health', 'government'],
        icons: [
          { src: '/iconos/icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/iconos/icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/iconos/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Buscar niño', url: '/ninos', icons: [{ src: '/iconos/icono-192.png', sizes: '192x192' }] },
          { name: 'Seguimiento', url: '/alertas', icons: [{ src: '/iconos/icono-192.png', sizes: '192x192' }] },
          { name: 'Jornadas', url: '/jornadas', icons: [{ src: '/iconos/icono-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        // Solo la fuente con alfabeto latino: las variantes cirílica y vietnamita no se usan
        globPatterns: ['**/*.{js,css,html,png,svg}', 'assets/nunito-latin-*.woff2'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [{
          // Consultas: primero la red; sin conexión, la última respuesta guardada (máximo 3 días)
          urlPattern: ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET' && !url.pathname.startsWith('/api/auth'),
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-consultas',
            networkTimeoutSeconds: 8,
            expiration: { maxEntries: 300, maxAgeSeconds: 3 * 24 * 60 * 60 },
            cacheableResponse: { statuses: [200] },
          },
        }],
      },
    }),
  ],
  server: {
    port: 5181,
    strictPort: true,
    // Conexión nueva en cada petición: reutilizar una que el servidor ya cerró daba ECONNRESET en el primer inicio de sesión
    proxy: { '/api': { target: 'http://localhost:3100', agent: new Agent({ keepAlive: false }) } },
  },
});
