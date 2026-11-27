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
    // Reminders, swaps and broadcasts go through notify's `notifyUser`: preferences stores each person's channel choices,
    // and push is notify's push driver (its log delivery, the default, "delivers" the pushes).
    '@frigear-nu/preferences',
    '@frigear-nu/push',
    '@frigear-nu/crew',
    // Installed so the dashboard items of operations, crew, teams and shifts are rendered on one page (`pages/dashboard-test.vue`).
    '@frigear-nu/dashboard',
    ShiftsModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`).
    // `admin` holds what the modules `grantTo` it (`shifts:manage`, `shifts:pii`, ...); `coordinator` is this host's own
    // role and names the same staff permissions of operations, teams, crew and shifts (without `crew:pii`);
    // `shiftmanager` holds `shifts:manage` only, so `shifts:pii` can be told apart; `wild` holds `shifts:*`, which never
    // covers `shifts:pii`. `supervisor` feeds a mapping rule (a mapped lead is not assignable). `checker` holds
    // `shifts:checkin` only: it checks anyone in on any shift without leading a team.
    (_options, nuxt) => {
      addRole(nuxt, { name: 'member', label: 'Member', grant: [] })
      addRole(nuxt, { name: 'supervisor', label: 'Supervisor', grant: [], inherit: ['member'] })
      addRole(nuxt, { name: 'admin', label: 'Admin', grant: [] })
      addRole(nuxt, {
        name: 'coordinator',
        label: 'Coordinator',
        grant: ['operations:manage', 'teams:manage', 'teams:pii', 'crew:manage', 'crew:invite', 'shifts:broadcast', 'shifts:manage', 'shifts:pii'],
      })
      addRole(nuxt, { name: 'shiftmanager', label: 'Shift manager', grant: ['shifts:manage'] })
      addRole(nuxt, { name: 'wild', label: 'Wildcard staff', grant: ['shifts:*'] })
      addRole(nuxt, { name: 'checker', label: 'Gate', grant: ['shifts:checkin'] })
      setRoleProvider(nuxt, { path: fileURLToPath(new URL('./server/roles/provider', import.meta.url)) })
    },
  ],
  pages: true,
  runtimeConfig: {
    session: {
      password: 'a-test-only-session-password-at-least-32-chars',
    },
    // Station check-in needs its own key; the tests turn it off per request through `/api/test/station-key`.
    shifts: {
      stationKey: 'a-test-only-station-key-at-least-32-chars',
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
  // Emails: the log driver of notify (the default), captured by a `notify:email` listener of the fixture. SMS: a driver of
  // the fixture that keeps what it was asked to send (`server/sms-driver.ts`).
  notify: { sms: { driver: './server/sms-driver' } },
  operations: {
    settings: { pages: { admin: true, adminOperation: true } },
  },
  shifts: {
    timeZone: 'Europe/Berlin',
    checkInOpensMinutes: 60,
    // The task is run by a test route with a fake `now`, never by a schedule; SMS is on so the tests can tell it apart
    // from a run that overrides it off.
    reminders: { cron: false, offsets: [1440, 120], sms: true },
    // The close task too is run by a test route with a fake `now`.
    automation: { cron: false },
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
