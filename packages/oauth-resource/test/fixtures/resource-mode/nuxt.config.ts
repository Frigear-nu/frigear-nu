import type { Nuxt } from '@nuxt/schema'
import { addPermission, addRole, setDefaultRoles } from '@frigear-nu/auth/utils'
import OAuthResourceModule from '../../../src/module'

// A consuming app (`authentication.mode: 'resource'`): people sign in at the issuer in the browser, and this server
// accepts the issuer's access tokens. The issuer is a stand-in server the test starts (`NUXT_OAUTH_RESOURCE_*_URL`).
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    OAuthResourceModule,
    (_options: unknown, nuxt: Nuxt) => {
      addPermission(nuxt, { name: 'notes:read', label: 'Read notes', implicit: true })
      // Granted by this app's own roles: every user is a `member` here.
      addPermission(nuxt, { name: 'notes:write', label: 'Write notes' })
      addRole(nuxt, { name: 'member', label: 'Member', grant: ['notes:write'], source: 'host' })
      setDefaultRoles(nuxt, ['member'])
    },
  ],
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
  },
  authentication: {
    mode: 'resource',
    client: { issuer: 'https://frigear.example.test', clientId: 'app_desktop' },
    permissions: [{ name: 'account:delete', label: 'Delete your account', sessionOnly: true }],
  },
  oauthResource: {
    issuer: 'https://frigear.example.test',
    audience: 'frigear-services',
  },
})
