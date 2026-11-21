import { fileURLToPath } from 'node:url'
import { addRole, setRoleProvider } from '@frigear-nu/auth/utils'
import { extendGrants } from '@frigear-nu/grants/utils'
import FaqModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxthub/core',
    // Answers render through `<MDC>`, the way they do in an app with Nuxt Content.
    '@nuxtjs/mdc',
    '@frigear-nu/users',
    '@frigear-nu/menu',
    '@frigear-nu/widget',
    '@frigear-nu/admin',
    FaqModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`).
    // `coordinator` is the role `faq:manage` is granted to (`grantTo`); a role the host does not configure is skipped.
    (_options, nuxt) => {
      addRole(nuxt, { name: 'coordinator', label: 'Coordinator', grant: [] })
      addRole(nuxt, { name: 'wild', label: 'Wildcard staff', grant: ['faq:*'] })
      addRole(nuxt, { name: 'supervisor', label: 'Supervisor', grant: [] })
      setRoleProvider(nuxt, { path: fileURLToPath(new URL('./server/roles/provider', import.meta.url)) })
    },
    // A grant kind of the app's own (`grants/club.ts`), next to the built-in `public` and `role`.
    (_options, nuxt) => {
      extendGrants(nuxt, { kind: 'club', label: 'Club', server: fileURLToPath(new URL('./grants/club', import.meta.url)) })
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
  faq: {
    settings: {
      pages: { admin: true },
      // The host's own contact button, a global component of this fixture.
      contactComponent: 'TestContact',
    },
  },
})
