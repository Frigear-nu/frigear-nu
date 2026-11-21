import { fileURLToPath } from 'node:url'
import { addRole, setRoleProvider } from '@frigear-nu/auth/utils'
import FaqModule from '../../../../faq/src/module'
import HelpCenterModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxthub/core',
    // Article bodies render through `<MDC>`, the way they do in an app with Nuxt Content.
    '@nuxtjs/mdc',
    '@frigear-nu/users',
    '@frigear-nu/menu',
    '@frigear-nu/widget',
    '@frigear-nu/admin',
    '@frigear-nu/notify',
    FaqModule,
    HelpCenterModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`).
    // `coordinator` is the role `help-center:manage`, `:send` and `:pii` are granted to (`grantTo`); a role the host does
    // not configure is skipped.
    (_options, nuxt) => {
      addRole(nuxt, { name: 'coordinator', label: 'Coordinator', grant: [] })
      addRole(nuxt, { name: 'wild', label: 'Wildcard staff', grant: ['help-center:*'] })
      addRole(nuxt, { name: 'barmanager', label: 'Bar manager', grant: [] })
      setRoleProvider(nuxt, { path: fileURLToPath(new URL('./server/roles/provider', import.meta.url)) })
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
  helpCenter: {
    settings: {
      pages: { admin: true },
      // A source of the host next to the database, registered by `server/plugins/wiki-source.ts`.
      sources: ['database', 'wiki'],
    },
  },
  notify: {
    // Emails are captured by a `notify:email` listener; texts by this driver.
    sms: { driver: './server/utils/sms-driver' },
  },
})
