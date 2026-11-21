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
    // Installed so the teams integration with maps (a team's leads editing its maps) is tested.
    '@frigear-nu/maps',
    TeamsModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`),
    // and a slice of the website's chain: `barmanager` inherits `member`. `coordinator` holds `teams:manage` and
    // `teams:pii` (the module's `grantTo`); `wild` holds `teams:*` only.
    (_options, nuxt) => {
      addRole(nuxt, { name: 'member', label: 'Member', grant: [] })
      addRole(nuxt, { name: 'barmanager', label: 'Bar manager', grant: [], inherit: ['member'] })
      addRole(nuxt, { name: 'coordinator', label: 'Coordinator', grant: [] })
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
    blob: true,
  },
  teams: {
    settings: { pages: { admin: true, adminTeam: true } },
    // A second kind next to the default `bar` ladder; nobody leads it.
    ladders: {
      firstaid: { roles: [{ key: 'helper', label: 'Helper' }, { key: 'medic', label: 'Medic' }] },
    },
  },
})
