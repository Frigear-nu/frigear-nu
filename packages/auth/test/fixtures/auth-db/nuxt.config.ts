import { fileURLToPath } from 'node:url'
import { registerBootstrapProvider } from '@frigear-nu/module-kit/utils'
import MyModule from '../../../src/module'
import { addAuthResolver } from '../../../src/runtime/utils/build'

const bootstrap = (name: string) => fileURLToPath(new URL(`./bootstrap/${name}`, import.meta.url))

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    MyModule,
    // Providers of the `/api/auth/bootstrap` test: two that load, one that fails, and one in another scope.
    (_options, nuxt) => {
      registerBootstrapProvider(nuxt, { scope: 'account', key: 'test:profile', handler: bootstrap('profile') })
      registerBootstrapProvider(nuxt, { scope: 'account', key: 'test:events', handler: bootstrap('events') })
      registerBootstrapProvider(nuxt, { scope: 'account', key: 'test:broken', handler: bootstrap('broken') })
      registerBootstrapProvider(nuxt, { scope: 'admin', key: 'test:admin', handler: bootstrap('profile') })
      // A host resolver that maps its token to a user without the store (`tokens.test.ts`, missing stored user).
      addAuthResolver(nuxt, { name: 'ghost', prefix: 'ghost_', resolver: fileURLToPath(new URL('./server/resolvers/ghost', import.meta.url)) })
    },
  ],
  runtimeConfig: {
    // Seals the session cookie; `tokens.test.ts` derives the same key to seal a session of its own.
    appSecret: 'a-test-only-app-secret-at-least-32-characters',
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
