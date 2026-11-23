import AuthModule from '../../../src/module'

// Loaded with `overrides` by `resource-checks.test.ts` (a resolver, `@frigear-nu/users`); this is only the base.
export default defineNuxtConfig({
  modules: [AuthModule],
  hub: {
    db: { dialect: 'sqlite', driver: 'libsql', applyMigrationsDuringBuild: false },
  },
  authentication: {
    mode: 'resource',
    client: { issuer: 'https://id.example.test', clientId: 'fixture-app', storage: 'local' },
    permissions: [
      { name: 'notes:read', label: 'Read notes', implicit: true },
      { name: 'account:delete', label: 'Delete your account', sessionOnly: true },
    ],
  },
})
