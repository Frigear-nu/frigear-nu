# @frigear-nu/audience

Shared visibility rules and owner references for the Frigear volunteering modules. FAQ groups, help articles, maps
and mailboxes store who may see them in one `visibility` shape, and this package decides whether a viewer passes. It
is a plain TypeScript library, not a Nuxt module.

```bash
pnpm add @frigear-nu/audience
```

```ts
import { isEmptyVisibility, isVisible, parseVisibility } from '@frigear-nu/audience'

// Stored JSON goes through parseVisibility: a malformed value or an unknown key fails closed.
const groupVisibility = parseVisibility(group.visibility)
const itemVisibility = parseVisibility(item.visibility)
const visible = isVisible(groupVisibility, viewer)
  && (isEmptyVisibility(itemVisibility) || isVisible(itemVisibility, viewer))
```

| Export | What it does |
| --- | --- |
| `Visibility`, `visibilitySchema`, `parseVisibility` | The `{ public?, globalRoles?, minTeamRole?, operationId? }` shape, its strict zod schema and a fail-closed parser. |
| `isVisible(visibility, viewer)` | Whether a viewer may see a record. Empty visibility means signed-in viewers only. |
| `narrowVisibility(parent, child, ladders?)`, `isNarrowerOrEqual(...)` | An item can only narrow its group: the effective value to store or show, and an editor check. |
| `roleAtLeast(ladder, held, min)` | Compares two roles of a team kind's ladder. |
| `Viewer`, `TeamRoleGrant`, `OwnerRef`, `OwnerType`, `OWNER_TYPES` | The shared types. |
| `@frigear-nu/audience/server` | The `audience:viewer:resolve` and `audience:owner:resolve` Nitro hooks, and `resolveViewer` / `resolveOwner`. |

Full reference: [docs.frigear.dev/modules/volunteering/audience](https://docs.frigear.dev/modules/volunteering/audience).
