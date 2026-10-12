# @frigear-nu/groups

User groups for the frigear ecosystem. A group has a localized name/description, an icon and members; other modules
(for example `@frigear-nu/documents`) share content with groups and ask this module whether a user belongs to one.

Managing groups is denied by default: answer the `groups:authorize` Nitro hook to let staff in.

```ts
nitroApp.hooks.hook('groups:authorize', (ctx) => { ctx.allowed = isStaff(ctx.userId) })
```

Server helpers (auto-imported in Nitro): `getUserGroupIds(userId)` and `isInGroups(userId, groupIds)`.
