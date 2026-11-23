import { fileURLToPath } from 'node:url'

// A demo of the maps building blocks: the location picker, the plane editor, and the web and mobile viewers, with a
// `demo.seat` feature kind and a `demo.crowd` live layer the way a module would register them.
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxthub/core', '../src/module'],
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  compatibilityDate: 'latest',
  hub: { blob: true },
  vite: { optimizeDeps: { include: ['leaflet', '@geoman-io/leaflet-geoman-free', 'zod'] } },
  maps: {
    kinds: [{
      id: 'demo.seat',
      label: { da: 'Sæde', en: 'Seat' },
      icon: 'i-lucide-armchair',
      geometry: 'Point',
      color: 'success',
      properties: fileURLToPath(new URL('./maps/seat', import.meta.url)),
    }],
    layers: [{
      id: 'demo.crowd',
      label: { da: 'Gæster nu', en: 'Guests now' },
      appliesTo: 'demo.venue',
      endpoint: '/api/demo/:venue/crowd',
      refreshInterval: 30,
      color: 'warning',
    }],
  },
})
