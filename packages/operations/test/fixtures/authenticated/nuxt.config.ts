import { fileURLToPath } from 'node:url'
import { addRole, setRoleProvider } from '@frigear-nu/auth/utils'
import { extendTabs } from '@frigear-nu/widget/utils'
import OperationsModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/menu',
    '@frigear-nu/widget',
    '@frigear-nu/admin',
    OperationsModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`).
    // `coordinator` is the role `operations:manage` is granted to (`grantTo`); a role the host does not configure is skipped.
    (_options, nuxt) => {
      addRole(nuxt, { name: 'coordinator', label: 'Coordinator', grant: [] })
      addRole(nuxt, { name: 'wild', label: 'Wildcard staff', grant: ['operations:*'] })
      setRoleProvider(nuxt, { path: fileURLToPath(new URL('./server/roles/provider', import.meta.url)) })
    },
    // Another module adding a tab to the operation page without operations knowing about it.
    (_options, nuxt) => {
      extendTabs(nuxt, 'admin.operations', {
        id: 'test-tab',
        component: fileURLToPath(new URL('./components/TestTab.vue', import.meta.url)),
        order: 50,
        label: 'Test tab',
        icon: 'i-lucide-flask-conical',
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
  },
  operations: {
    settings: { pages: { public: true, admin: true, adminOperation: true } },
  },
})
