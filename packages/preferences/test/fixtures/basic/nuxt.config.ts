import { extendNotificationTopics } from '@frigear-nu/notify/utils'
import PreferencesModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    PreferencesModule,
    // What modules that send notifications register with notify.
    (_options, nuxt) => {
      extendNotificationTopics(nuxt, [
        { id: 'shifts.reminder', label: { da: 'Vagtpåmindelser', en: 'Shift reminders' }, defaults: { email: true, sms: false, push: true } },
        { id: 'broadcast', label: 'Broadcasts', defaults: { email: true, sms: false, push: false }, channels: ['email', 'push'] },
      ])
    },
  ],
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
  },
  // Emails and texts are captured in memory (see `server/utils/*-driver.ts`).
  notify: {
    email: { driver: './server/utils/mail-driver' },
    sms: { driver: './server/utils/sms-driver' },
  },
})
