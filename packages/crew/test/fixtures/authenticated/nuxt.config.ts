import { fileURLToPath } from 'node:url'
import { addRole, setRoleProvider } from '@frigear-nu/auth/utils'
import CrewModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/menu',
    '@frigear-nu/widget',
    '@frigear-nu/admin',
    '@frigear-nu/operations',
    '@frigear-nu/teams',
    '@frigear-nu/forms',
    '@frigear-nu/notify',
    CrewModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`),
    // and a slice of the website's chain: `barmanager` inherits `member`. `admin` and `coordinator` hold what the modules
    // `grantTo` them (operations, teams, forms and crew: `crew:manage`, `crew:pii`, `crew:invite`). `crewmanager` holds
    // `crew:manage` only, so `crew:pii` can be told apart; `wild` holds `crew:*`, which never covers `crew:pii`.
    (_options, nuxt) => {
      addRole(nuxt, { name: 'member', label: 'Member', grant: [] })
      addRole(nuxt, { name: 'barmanager', label: 'Bar manager', grant: [], inherit: ['member'] })
      addRole(nuxt, { name: 'crew', label: 'Crew', grant: [] })
      addRole(nuxt, { name: 'admin', label: 'Admin', grant: [] })
      addRole(nuxt, { name: 'coordinator', label: 'Coordinator', grant: [] })
      addRole(nuxt, { name: 'crewmanager', label: 'Crew manager', grant: ['crew:manage'] })
      addRole(nuxt, { name: 'wild', label: 'Wildcard staff', grant: ['crew:*'] })
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
    blob: true,
  },
  // The log driver of notify (the default): the emails are captured by a `notify:email` listener of the fixture.
  crew: {
    memberPlan: 'member-plan',
  },
  forms: {
    settings: { rateLimit: 0, pages: { form: true } },
  },
  operations: {
    settings: { pages: { public: true, admin: true, adminOperation: true } },
  },
  teams: {
    settings: { pages: { admin: true, adminTeam: true } },
  },
})
