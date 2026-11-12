import { fileURLToPath } from 'node:url'
import { addRole, setRoleProvider } from '@frigear-nu/auth/utils'
import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    MyModule,
    // Roles without `@frigear-nu/authorization`: an admin role, and a provider reading the test user's `role`.
    (_options, nuxt) => {
      addRole(nuxt, { name: 'admin', label: 'Admin' })
      setRoleProvider(nuxt, { path: fileURLToPath(new URL('./server/roles/provider', import.meta.url)) })
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
    permissions: [
      { name: 'notes:read', description: 'Read your notes', implicit: true },
      { name: 'notes:manage', description: 'Manage notes', grantTo: ['admin'] },
      { name: 'notes:pii', description: 'See who wrote notes', grantTo: ['admin'] },
      { name: 'notes:wipe', description: 'Wipe notes (cookie session only)', sessionOnly: true, grantTo: ['admin'] },
    ],
  },
})
