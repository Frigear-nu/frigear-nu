# @frigear-nu/documents

Folders and uploaded documents (PDFs etc.) for the frigear ecosystem, shared with the user groups of
`@frigear-nu/groups` (or everyone). Files live in NuxtHub blob and are only served through an authorized route.
Titles and descriptions are localized and every item can carry an icon. With `@frigear-nu/menu` a *Documents* tile
is added to the account menu.

Managing documents is denied by default: answer the `documents:authorize` Nitro hook to let staff in (staff also see
every document).

```ts
nitroApp.hooks.hook('documents:authorize', (ctx) => { ctx.allowed = isStaff(ctx.userId) })
```
