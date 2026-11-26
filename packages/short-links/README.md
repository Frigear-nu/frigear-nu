# @frigear-nu/short-links

Short, counted links for emails and SMS that any module can make: random 7 character codes or vanity slugs, a public
redirect (`/l/:code` and `/l/:code/:subject`), click counts without IP addresses, and a `short-links:clicked` Nitro hook
so the owning module can attribute each click. Staff see and manage every link on `/admin/short-links`.

## Quick Setup

Requires `@nuxthub/core`. `@frigear-nu/admin` (admin page) and `@frigear-nu/menu` (its sidebar entry) are optional.

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/admin', '@frigear-nu/short-links'],
  shortLinks: { baseUrl: 'https://frg.nu' }, // optional short domain
})
```

Generate and commit a migration for the `short_links` and `short_link_clicks` tables in your app.

```ts
// Server code (auto-imported)
const link = await createShortLink({ url: 'https://example.org/apply', owner: { module: 'crew', refId: crewId } })
shortLinkUrl(link, deliveryToken) // 'https://frg.nu/l/x7Gk2Qa/<deliveryToken>'
await disableShortLinks({ module: 'crew', refId: crewId })
```

```ts
// server/plugins/clicks.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('short-links:clicked', ({ link, subject }) => { /* attribute the click */ })
})
```

Only `http(s)` targets are accepted, the redirect only ever goes to the stored URL, and HEAD requests and link scanners
are redirected without being counted. The admin API needs `short-links:manage` (granted to `admin`).

Full documentation: <https://docs.frigear.dev/modules/communication/short-links>.
