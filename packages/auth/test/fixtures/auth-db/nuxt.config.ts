import { fileURLToPath } from 'node:url'
import { registerBootstrapProvider } from '@frigear-nu/module-kit/utils'
import MyModule from '../../../src/module'

const bootstrap = (name: string) => fileURLToPath(new URL(`./bootstrap/${name}`, import.meta.url))

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    MyModule,
    // Providers of the `/api/_bootstrap` test: two that load, one that fails, and one in another scope.
    (_options, nuxt) => {
      registerBootstrapProvider(nuxt, { scope: 'account', key: 'test:profile', handler: bootstrap('profile') })
      registerBootstrapProvider(nuxt, { scope: 'account', key: 'test:events', handler: bootstrap('events') })
      registerBootstrapProvider(nuxt, { scope: 'account', key: 'test:broken', handler: bootstrap('broken') })
      registerBootstrapProvider(nuxt, { scope: 'admin', key: 'test:admin', handler: bootstrap('profile') })
    },
  ],
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
  },
  authentication: {
    userStore: './server/utils/user-store',
    settings: { password: false },
    scopes: [
      { name: 'events:read', description: 'Read events' },
      { name: 'events:write', description: 'Change events' },
      { name: 'events:admin', description: 'Administer events', roles: ['admin'] },
    ],
  },
})
