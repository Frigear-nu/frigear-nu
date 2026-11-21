# @frigear-nu/operations

The occasions an organisation works at, whether or not it hosts them (such as a festival bar). An operation has a
period, a place, a host and a status (`planning`, `active`, `wrapped_up`, `archived`), and is the anchor that crew,
shifts and help content attach to. Part of the volunteering modules; it follows the contracts of
[`@frigear-nu/audience`](../audience).

## Quick Setup

Requires `@nuxthub/core`. `@frigear-nu/admin` (admin pages), `@frigear-nu/widget` (tabs on the operation page),
`@frigear-nu/menu` and `@frigear-nu/events` are optional; `@nuxt/ui` is needed for the pages.

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/admin', '@frigear-nu/operations'],
  operations: { settings: { pages: { admin: true, adminOperation: true } } },
})
```

Generate and commit a migration for the `operations` table in your app (see the repository `AGENTS.md`).

Staff routes need the `operations:manage` permission, granted to the `admin` and `coordinator` roles. Any signed-in user
holds `operations:read`: public operations and the ones they take part in (`viewer.operationIds` of
`@frigear-nu/audience`, filled by crew).

Other modules add tabs to the operation page with `extendTabs(nuxt, 'admin.operations', ...)` and listen to the
`operations:created`, `operations:updated` and `operations:status-changed` hooks.

Full documentation: <https://docs.frigear.dev/modules/volunteering/operations>.
