# @frigear-nu/audience

Shared visibility rules and owner references for the Frigear volunteering modules. FAQ groups, help articles, maps
and mailboxes store who may see them in one `visibility` shape, and this package decides whether a viewer passes. It
is a plain TypeScript library, not a Nuxt module.

```bash
pnpm add @frigear-nu/audience
```

```ts
import { isVisible, narrowVisibility } from '@frigear-nu/audience'

const visibility = narrowVisibility(group.visibility, item.visibility, viewer.ladders)
if (!isVisible(visibility, viewer)) throw notFound()
```

| Export | What it does |
| --- | --- |
| `Visibility`, `visibilitySchema`, `parseVisibility` | The `{ public?, globalRoles?, minTeamRole?, operationId? }` shape, its zod schema and a fail-closed parser. |
| `isVisible(visibility, viewer)` | Whether a viewer may see a record. Empty visibility means signed-in viewers only. |
| `narrowVisibility(parent, child, ladders?)`, `isNarrowerOrEqual(...)` | An item can only narrow its group. |
| `roleAtLeast(ladder, held, min)` | Compares two roles of a team kind's ladder. |
| `Viewer`, `TeamRoleGrant`, `OwnerRef`, `OwnerType`, `OWNER_TYPES` | The shared types. |
| `@frigear-nu/audience/server` | The `audience:viewer:resolve` and `audience:owner:resolve` Nitro hooks, and `resolveViewer` / `resolveOwner`. |

Full reference: [docs.frigear.dev/modules/volunteering/audience](https://docs.frigear.dev/modules/volunteering/audience).
