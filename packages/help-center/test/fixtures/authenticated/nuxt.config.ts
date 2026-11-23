import { fileURLToPath } from 'node:url'
import { addRole, extendGrants, setDefaultRoles, setRoleProvider } from '@frigear-nu/auth/utils'
import { setNotifyChoicesStore } from '@frigear-nu/notify/utils'
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
    // Emails render from their templates (`help-center-articles`), the way they do in an app with email templates.
    '@frigear-nu/email-templates',
    HelpCenterModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`).
    // `coordinator` is the role `help-center:manage`, `:send` and `:pii` are granted to (`grantTo`); a role the host does
    // not configure is skipped.
    (_options, nuxt) => {
      addRole(nuxt, { name: 'coordinator', label: 'Coordinator', grant: ['help-center:manage', 'help-center:send', 'help-center:pii'] })
      addRole(nuxt, { name: 'wild', label: 'Wildcard staff', grant: ['help-center:*'] })
      addRole(nuxt, { name: 'supervisor', label: 'Supervisor', grant: [] })
      // Every signed-in user holds `member`: a `{ kind: 'role', role: 'member' }` grant is "every signed-in user".
      addRole(nuxt, { name: 'member', label: 'Member', grant: [] })
      setDefaultRoles(nuxt, ['member'])
      setRoleProvider(nuxt, { path: fileURLToPath(new URL('./server/roles/provider', import.meta.url)) })
      // `role` grants without `@frigear-nu/authorization`: a stand-in kind that reads this provider (`grants/role.ts`).
      extendGrants(nuxt, { kind: 'role', label: 'Role', server: fileURLToPath(new URL('./grants/role', import.meta.url)) })
    },
    // Notification choices without `@frigear-nu/preferences`: an in-memory store (`choices-store.ts`), so a test can turn
    // a topic's SMS on for one person.
    (_options, nuxt) => {
      setNotifyChoicesStore(nuxt, fileURLToPath(new URL('./choices-store', import.meta.url)))
    },
    // The `operation` grant kind, standing in for `@frigear-nu/operations` with crew: who takes part is test state.
    (_options, nuxt) => {
      extendGrants(nuxt, { kind: 'operation', label: 'Operation', server: fileURLToPath(new URL('./grants/operation', import.meta.url)) })
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
      // The wiki wins a clash of slugs; categories still put the database first.
      content: { precedence: 'wiki' },
    },
  },
  notify: {
    // Emails are captured by a `notify:email` listener, and as delivered (rendered) by this driver; texts by this one.
    email: { driver: './server/utils/mail-driver' },
    sms: { driver: './server/utils/sms-driver' },
  },
})
