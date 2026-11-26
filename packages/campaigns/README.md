# @frigear-nu/campaigns

Newsletters people sign up to, also without an account: lists with double opt-in by email or SMS, a stored consent
proof per subscription, one-click unsubscribe links, the `<NewsletterSignup>` component and the staff pages for the
lists. Every message goes through [notify](../notify), on the drivers the app sets.

- Tables `campaign_lists`, `campaign_contacts` and `campaign_subscriptions` (sqlite and postgresql).
- Public routes: `GET /api/campaigns/lists/:slug`, `POST /api/campaigns/lists/:slug/subscribe` (rate limited, optional
  captcha through forms, CORS for `corsOrigins`, the same answer for every address), `POST /api/campaigns/confirm/:token`
  and `POST /api/campaigns/unsubscribe/:token` (RFC 8058 one-click).
- `GET`/`PATCH /api/campaigns/me/subscriptions` for the signed-in user (`campaigns:subscriptions`).
- Staff routes under `/api/admin/campaigns/lists` (`campaigns:manage`; addresses need `campaigns:pii`).
- Pages `/newsletter/confirm`, `/newsletter/unsubscribe` (both act on a button, never on opening the link),
  `/account/newsletters`, and with `@frigear-nu/admin` `/admin/campaigns/lists` and `/admin/campaigns/lists/:id`.
- The `campaigns-confirm` email template (with `@frigear-nu/email-templates`).

## Quick Setup

Requires `@nuxthub/core` with a database and KV (the rate limit). Auth, Users, Notify and UI are installed for you;
Admin, Menu and Email Templates are optional, and Forms is needed for a captcha.

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/users', '@frigear-nu/admin', '@frigear-nu/campaigns'],
  hub: { db: 'sqlite', kv: true },
  campaigns: {
    // Other sites allowed to post to the subscribe route from the browser.
    corsOrigins: ['https://example.org'],
  },
})
```

Generate and commit a migration for the new tables. Unsubscribe links are signed with a key derived from
`NUXT_APP_SECRET` (or `NUXT_CAMPAIGNS_SIGNING_KEY`).

Full documentation: `apps/docs/content/3.modules/6.communication/6.campaigns`.
