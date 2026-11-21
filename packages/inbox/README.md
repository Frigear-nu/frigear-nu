# @frigear-nu/inbox

Shared support inboxes for Frigear apps. Messages from the website contact form, email, WhatsApp, Messenger and
Instagram land in mailboxes that staff read together: they assign threads, write internal notes, hide threads from
lower roles and reply, and the reply goes out through the channel the message came in on. Every view and reply is in
an audit log, closed threads are deleted (or anonymised) after a retention period, and a contact's data can be
exported and erased.

```bash
pnpm add @frigear-nu/inbox @frigear-nu/audience
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/users', '@frigear-nu/forms', '@frigear-nu/inbox'],
  hub: { db: 'sqlite' },
  inbox: {
    mailboxes: [{ key: 'support', name: 'Support', visibility: { globalRoles: ['coordinator'] } }],
    settings: { pages: { admin: true, adminThread: true, adminSettings: true } },
  },
})
```

Secrets come from the environment, never the database: `NUXT_INBOX_EMAIL_WEBHOOK_SECRET`,
`NUXT_INBOX_META_APP_SECRET`, `NUXT_INBOX_META_VERIFY_TOKEN` and one `NUXT_INBOX_SECRET_<REF>` per channel token.

| Export | What it does |
| --- | --- |
| `extendInbox`, `defineInboxChannel` (`@frigear-nu/inbox/utils`) | Register a channel (an adapter with `send` and an optional webhook `inbound`) from a module's `setup()`. |
| `inboxReceive`, `inboxRunRetention`, `inboxEraseContact` (server utils) | Store an inbound message, run retention, erase a contact. |
| `inboxApi` (`@frigear-nu/inbox/api`) | Typed paths of the HTTP API and the webhooks. |
| `inbox:message:received`, `inbox:message:sent`, `inbox:thread:assigned`, `inbox:thread:status-changed` | Nitro hooks. |

WhatsApp, Messenger and Instagram need Meta business verification, a WhatsApp Business number and app review before
they work: start those early.

Full reference: [docs.frigear.dev/modules/volunteering/inbox](https://docs.frigear.dev/modules/volunteering/inbox).
