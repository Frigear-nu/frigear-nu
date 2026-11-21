# @frigear-nu/grants

Who may see a record, as a list of grants: `[{ kind: 'role', role: 'admin' }, { kind: 'team', teamId, minRole: 'lead' }]`.
Any one grant admits, and an empty list admits nobody. A grant kind has a zod schema, `matches` (does this user match?)
and `members` (who matches?). The module ships the `public` and `role` kinds; other modules register their own with
`extendGrants` (teams registers `team`, operations registers `operation`). An unknown kind admits nobody.

## Quick Setup

Requires `@nuxthub/core` and `@frigear-nu/auth`. Modules that store grants install it for you.

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/grants'],
})
```

- Store a list in a JSON column named `grants` (`text({ mode: 'json' })` on sqlite, `jsonb()` on postgresql).
- Validate input with `grantListShape` (from `@frigear-nu/grants/core`), then check it with `grantsValidate(event, grants)`:
  unknown kinds, invalid grants and references that do not exist are a 400.
- Declare a read permission and a policy on it that calls `grantsMatch(event, user, record.grants)`.
- Serve a record with `grantsCanRead(event, permission, record)`: a `public` grant is served without sign-in, every
  other record goes through `allows()` and the policy.
- Edit a list with `<GrantsEditor v-model="grants" />`.

Full documentation: <https://docs.frigear.dev/modules/platform/grants>.
