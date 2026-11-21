import { generateKeyPairSync } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { addRole, setRoleProvider } from '@frigear-nu/auth/utils'
import PushModule from '../../../src/module'
import { extendNotificationTopics } from '../../../src/runtime/utils/topics'

// Test provider credentials, generated per run. The fake providers (`server/plugins/fake-providers.ts`) verify the
// JWTs against the public halves they derive from these keys, so a wrong algorithm, issuer or key fails the test.
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    PushModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`).
    (_options, nuxt) => {
      addRole(nuxt, { name: 'staff', label: 'Staff', grant: ['push:manage', 'push:send', 'users:read'] })
      // May see users but not their devices (the devices route needs `push:manage`).
      addRole(nuxt, { name: 'reader', label: 'Reader', grant: ['users:read'] })
      setRoleProvider(nuxt, { path: fileURLToPath(new URL('./server/roles/provider', import.meta.url)) })

      // What a module that sends notifications would register.
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
    push: {
      fcm: {
        serviceAccount: JSON.stringify({
          type: 'service_account',
          project_id: 'test-project',
          client_email: 'push@test-project.iam.gserviceaccount.com',
          private_key: rsa.privateKey,
          token_uri: 'https://oauth2.googleapis.com/token',
        }),
      },
      apns: { keyId: 'KEY1234567', teamId: 'TEAM123456', topic: 'com.example.test', privateKey: ec.privateKey, sandbox: false },
    },
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
  },
  // Email and SMS are captured in memory (see `server/utils/*-driver.ts`).
  notify: {
    email: { driver: './server/utils/mail-driver' },
    sms: { driver: './server/utils/sms-driver' },
  },
  // The users admin API (and its `users:read` permission) the devices route below a user builds on.
  users: {
    settings: { admin: { page: false } },
  },
})
