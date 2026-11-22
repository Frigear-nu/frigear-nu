import { fileURLToPath } from 'node:url'
import { addRole, setRoleProvider } from '@frigear-nu/auth/utils'
import TeamsModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/menu',
    '@frigear-nu/widget',
    '@frigear-nu/admin',
    TeamsModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`),
    // and a small role chain: `supervisor` inherits `member`. `coordinator` is this host's own role: it
    // names `teams:manage` and `teams:pii` (the module grants them to `admin` only); `wild` holds `teams:*` only.
    (_options, nuxt) => {
      addRole(nuxt, { name: 'member', label: 'Member', grant: [] })
      addRole(nuxt, { name: 'supervisor', label: 'Supervisor', grant: [], inherit: ['member'] })
      addRole(nuxt, { name: 'coordinator', label: 'Coordinator', grant: ['teams:manage', 'teams:pii'] })
      addRole(nuxt, { name: 'wild', label: 'Wildcard staff', grant: ['teams:*'] })
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
  teams: {
    settings: { pages: { admin: true, adminTeam: true } },
    // The app's own kinds next to the shipped `default` ladder: a `bar` ladder led from `lead`, and a kind nobody leads.
    ladders: {
      bar: {
        roles: [
          { key: 'volunteer', label: 'Volunteer' },
          { key: 'bartender', label: 'Bartender' },
          { key: 'lead', label: 'Lead' },
          { key: 'coordinator', label: 'Coordinator' },
        ],
        leadFrom: 'lead',
      },
      firstaid: { roles: [{ key: 'helper', label: 'Helper' }, { key: 'medic', label: 'Medic' }] },
    },
  },
})
