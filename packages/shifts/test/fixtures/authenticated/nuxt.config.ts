import { fileURLToPath } from 'node:url'
import { addRole, setRoleProvider } from '@frigear-nu/auth/utils'
import ShiftsModule from '../../../src/module'

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
    '@frigear-nu/crew',
    ShiftsModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`).
    // `admin` and `coordinator` hold what the modules `grantTo` them (`shifts:manage`, `shifts:pii`, ...);
    // `shiftmanager` holds `shifts:manage` only, so `shifts:pii` can be told apart; `wild` holds `shifts:*`, which never
    // covers `shifts:pii`. `supervisor` feeds a mapping rule (a mapped lead is not assignable).
    (_options, nuxt) => {
      addRole(nuxt, { name: 'member', label: 'Member', grant: [] })
      addRole(nuxt, { name: 'supervisor', label: 'Supervisor', grant: [], inherit: ['member'] })
      addRole(nuxt, { name: 'admin', label: 'Admin', grant: [] })
      addRole(nuxt, { name: 'coordinator', label: 'Coordinator', grant: [] })
      addRole(nuxt, { name: 'shiftmanager', label: 'Shift manager', grant: ['shifts:manage'] })
      addRole(nuxt, { name: 'wild', label: 'Wildcard staff', grant: ['shifts:*'] })
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
  operations: {
    settings: { pages: { admin: true, adminOperation: true } },
  },
  // The log driver of notify (the default): the emails are captured by a `notify:email` listener of the fixture.
  shifts: {
    timeZone: 'Europe/Berlin',
    checkInOpensMinutes: 60,
  },
  // The app's own ladder for the `bar` kind, led from `lead`.
  teams: {
    ladders: {
      bar: {
        roles: [
          { key: 'volunteer', label: { en: 'Volunteer', da: 'Frivillig' } },
          { key: 'bartender', label: { en: 'Bartender', da: 'Bartender' } },
          { key: 'lead', label: { en: 'Lead', da: 'Leder' } },
          { key: 'coordinator', label: { en: 'Coordinator', da: 'Koordinator' } },
        ],
        leadFrom: 'lead',
      },
    },
  },
})
