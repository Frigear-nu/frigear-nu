import { fileURLToPath } from 'node:url'
import { registerBootstrapProvider } from '@frigear-nu/module-kit/utils'
import MyModule from '../../../src/module'
import { addAuthResolver, addRole, setRoleProvider } from '../../../src/runtime/utils/build'

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
      // Roles without `@frigear-nu/authorization`: an admin role, and a provider reading the test user's `role`.
      addRole(nuxt, { name: 'admin', label: 'Admin', grant: ['*'], source: 'host' })
      setRoleProvider(nuxt, { path: fileURLToPath(new URL('./server/roles/provider', import.meta.url)) })
    },
  ],
  runtimeConfig: {
    // Seals the session cookie; `tokens.test.ts` derives the same key to seal a session of its own.
    appSecret: 'a-test-only-app-secret-at-least-32-characters',
  },
  // Enforced by auth's middleware (`tokens.test.ts`, route rules).
  routeRules: {
    '/api/test/admin-only': { permission: 'events:admin' },
    '/api/test/signed-in': { authenticated: true },
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
    permissions: [
      { name: 'events:read', description: 'Read events', implicit: true },
      { name: 'events:write', description: 'Change events', implicit: true },
      { name: 'events:admin', description: 'Administer events' },
      { name: 'account:delete', description: 'Delete your account', sessionOnly: true },
    ],
  },
})
