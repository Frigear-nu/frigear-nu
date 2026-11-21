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
    // Installed so the integrations with maps (the venue layouts of operations, the `shifts.on-duty` layer) are tested.
    '@frigear-nu/maps',
    ShiftsModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`).
    // `admin` and `coordinator` hold what the modules `grantTo` them (`shifts:manage`, `shifts:pii`, ...);
    // `shiftmanager` holds `shifts:manage` only, so `shifts:pii` can be told apart; `wild` holds `shifts:*`, which never
    // covers `shifts:pii`. `barmanager` feeds a mapping rule (a mapped BA is not assignable).
    (_options, nuxt) => {
      addRole(nuxt, { name: 'member', label: 'Member', grant: [] })
      addRole(nuxt, { name: 'barmanager', label: 'Bar manager', grant: [], inherit: ['member'] })
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
  // Emails: the log driver of notify (the default), captured by a `notify:email` listener of the fixture. SMS: a driver of
  // the fixture that keeps what it was asked to send (`server/sms-driver.ts`).
  notify: { sms: { driver: './server/sms-driver' } },
  operations: {
    settings: { pages: { admin: true, adminOperation: true } },
  },
  shifts: {
    timeZone: 'Europe/Copenhagen',
    checkInOpensMinutes: 60,
    // The task is run by a test route with a fake `now`, never by a schedule; SMS is on so the tests can tell it apart
    // from a run that overrides it off.
    reminders: { cron: false, offsets: [1440, 120], sms: true },
  },
})
