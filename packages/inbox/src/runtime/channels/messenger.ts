import { defineInboxChannel } from '../utils'

// Replies go out through the Graph API with the account's access token (`secretRef`); inbound messages arrive on the
// shared Meta webhook (`/api/inbox/webhooks/meta`), not through this adapter.
export default defineInboxChannel({
  id: 'messenger',
  send: ctx => inboxMetaSend('messenger', ctx),
})
