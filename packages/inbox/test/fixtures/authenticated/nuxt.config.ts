import { fileURLToPath } from 'node:url'
import { addRole, extendGrants, setRoleProvider } from '@frigear-nu/auth/utils'
import { setNotifyChoicesStore } from '@frigear-nu/notify/utils'
import { extendInbox } from '../../../src/runtime/utils'
import InboxModule from '../../../src/module'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/menu',
    '@frigear-nu/widget',
    '@frigear-nu/admin',
    '@frigear-nu/notify',
    '@frigear-nu/forms',
    InboxModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`),
    // and a slice of the website's chain: `admin` inherits `coordinator`, which inherits `crew`. `admin` holds
    // what the module `grantTo`s it, `coordinator` names `inbox:assign` and `inbox:hide` itself; `wild` holds `inbox:*`,
    // which never covers the `:pii` ones.
    (_options, nuxt) => {
      addRole(nuxt, { name: 'crew', label: 'Crew', grant: [] })
      addRole(nuxt, { name: 'coordinator', label: 'Coordinator', grant: ['inbox:assign', 'inbox:hide'], inherit: ['crew'] })
      addRole(nuxt, { name: 'admin', label: 'Admin', grant: [], inherit: ['coordinator'] })
      addRole(nuxt, { name: 'wild', label: 'Wildcard staff', grant: ['inbox:*'] })
      // A privacy officer: contact details, exports and the audit log, but only the mailboxes a coordinator reads.
      addRole(nuxt, { name: 'dpo', label: 'Privacy officer', grant: ['inbox:pii', 'inbox-audit:pii'], inherit: ['coordinator'] })
      setRoleProvider(nuxt, { path: here('./server/roles/provider') })
      // `role` grants without `@frigear-nu/authorization`: a stand-in kind that reads this provider (`grants/role.ts`).
      extendGrants(nuxt, { kind: 'role', label: 'Role', server: here('./grants/role') })
    },
    // Notification choices without `@frigear-nu/preferences`: an in-memory store (`choices-store.ts`), so a test can turn
    // email on for the assignee's `inbox.message` topic.
    (_options, nuxt) => {
      setNotifyChoicesStore(nuxt, here('./choices-store'))
    },
    // A module with a channel of its own, registered with `extendInbox` only: its adapter records what it sends and reads
    // its webhook (`server/inbox/fake-channel.ts`).
    (_options, nuxt) => {
      extendInbox(nuxt, {
        channels: [{ id: 'test.fake', label: { da: 'Testkanal', en: 'Test channel' }, icon: 'i-lucide-flask-conical', adapter: here('./server/inbox/fake-channel') }],
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
  forms: {
    settings: { rateLimit: 0, pages: { form: true } },
  },
  inbox: {
    // `reply.test` is an inbox domain: replies from an account on it carry a reply address (`help+ibt_...@reply.test`).
    // The Cloudflare and Resend drivers are installed; Resend has no secret here, so its webhook answers 501.
    email: { webhookSecret: 'test-email-secret', domains: ['reply.test'], inbound: { webhook: true, cloudflare: true, resend: true } },
    meta: { appSecret: 'test-app-secret', verifyToken: 'test-verify-token' },
    // `ENV_TOKEN` is declared empty and set by `NUXT_INBOX_SECRETS_ENV_TOKEN` in the test's environment.
    // `FAKE_WEBHOOK` is the fake channel's `inboundSecret`, the token its webhook checks.
    secrets: { FAKE_TOKEN: 'fake-token-value', FAKE_WEBHOOK: 'let-me-in', ENV_TOKEN: '' },
    // The retention task runs from a test route with a fake `now`, never on a schedule here.
    retention: { days: 30, cron: false },
    mailboxes: [
      { key: 'support', name: { da: 'Support', en: 'Support' }, grants: [{ kind: 'role', role: 'coordinator' }] },
      { key: 'board', name: { da: 'Bestyrelsen', en: 'Board' }, grants: [{ kind: 'role', role: 'admin' }], retentionDays: 365 },
    ],
    settings: {
      pages: { admin: true, adminThread: true, adminSettings: true },
    },
  },
})
