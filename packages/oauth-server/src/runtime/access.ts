import { defineAccess } from '@frigear-nu/auth/access'

// What the OAuth server adds to access control, registered in `module.ts` (`registerAccess`). Scopes configured in
// `oauthServer.scopes` are registered from the options there.
export const oauthAccess = defineAccess('oauth', {
  i18n: 'oauthServer',
  permissions: {
    // Self-service: every signed-in user sees their own applications.
    read: { label: 'See which applications you can sign in to', implicit: true },
    // Client secrets and who may sign in where: a browser session only.
    manage: { label: 'Manage OAuth applications and scopes', sessionOnly: true, grantTo: ['admin'] },
  },
})
