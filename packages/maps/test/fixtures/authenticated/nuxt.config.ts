import { fileURLToPath } from 'node:url'
import { addPermission, addRole, setRoleProvider } from '@frigear-nu/auth/utils'
import { defineMapFeatureKind, defineMapKind, defineMapLayer, extendMaps } from '../../../src/runtime/utils'
import MapsModule from '../../../src/module'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/menu',
    '@frigear-nu/widget',
    '@frigear-nu/admin',
    MapsModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`).
    // `coordinator` is a role `maps:manage` is granted to (`grantTo`).
    (_options, nuxt) => {
      addPermission(nuxt,
        { name: 'first-aid:manage', label: 'Manage first aid', grantTo: ['firstaid'] },
        { name: 'test-shifts:read', label: 'Read shifts (test)', grantTo: ['shiftreader'] },
      )
      addRole(nuxt,
        { name: 'coordinator', label: 'Coordinator', grant: [] },
        { name: 'firstaid', label: 'First aid lead', grant: [] },
        { name: 'shiftreader', label: 'Shift reader', grant: [] },
        { name: 'vip', label: 'VIP', grant: [] },
      )
      setRoleProvider(nuxt, { path: here('./server/roles/provider') })
    },
    // A module that ships its own map kind, feature kind and provider layers with `extendMaps` only, the way a
    // `@frigear-nu/first-aid` module would.
    (_options, nuxt) => {
      extendMaps(nuxt, {
        featureKinds: [defineMapFeatureKind({
          id: 'first-aid.post',
          label: { da: 'Førstehjælpspost', en: 'First aid post' },
          icon: 'i-lucide-cross',
          geometry: 'Point',
          color: 'error',
          properties: here('./maps/post-properties'),
        })],
        kinds: [
          defineMapKind({
            id: 'first-aid',
            label: { da: 'Førstehjælpsposter', en: 'First aid posts' },
            base: 'geo',
            ownerType: 'operation',
            defaultView: { center: [55.617, 12.079], zoom: 15 },
            featureKinds: ['first-aid.post', 'maps.marker'],
            editorTools: ['marker'],
            editPermission: 'first-aid:manage',
            defaultLayers: [
              { key: 'posts', name: { da: 'Poster', en: 'Posts' } },
              { key: 'reference', name: { da: 'Reference', en: 'Reference' }, editable: false },
            ],
            page: '/first-aid/:map',
          }),
          defineMapKind({
            id: 'test.venue',
            label: 'Venue layout',
            base: 'plane',
            ownerType: 'team',
            featureKinds: ['maps.area', 'maps.marker', 'maps.label'],
            editorTools: ['polygon', 'rectangle', 'marker', 'text', 'snapGrid'],
          }),
        ],
        layers: [
          defineMapLayer({
            key: 'test.on-duty',
            label: { da: 'På vagt', en: 'On duty' },
            appliesTo: [{ kind: 'test.venue' }, { mapKey: 'seeded-site' }],
            provider: here('./server/maps/on-duty'),
            permission: 'test-shifts:read',
            refreshInterval: 30,
          }),
          defineMapLayer({
            key: 'test.open',
            label: 'Open layer',
            appliesTo: { mapKey: 'seeded-site' },
            provider: here('./server/maps/open'),
          }),
        ],
      })
    },
  ],
  pages: true,
  runtimeConfig: {
    session: {
      password: 'a-test-only-session-password-at-least-32-chars',
    },
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
    kv: true,
    blob: true,
  },
  maps: {
    settings: {
      pages: { view: true, admin: true, adminMap: true },
      // Small, so the size limit is cheap to test.
      maxUnderlayBytes: 200_000,
    },
  },
})
