---
title: Volunteering
description: The shared contracts of the crew and volunteer modules, so operations, teams, shifts and content modules fit together without importing each other.
navigation:
  title: Overview
---

The volunteering modules run crew work: the occasions Frigear staffs, the teams and crew that work them, their shifts,
and the FAQ, help center, maps and inbox those people use. Each one is a separate module, and they plug into each
other through hooks and registries instead of imports. This page is for module authors. It holds the contracts every
volunteering module follows: roles, owners, visibility, hook names, dashboard items and team roles.

The only package that exists today is [Audience](/modules/volunteering/audience), the shared visibility rules. Every
other module adds its own page to this group in the pull request that adds the module.

## The modules

| Module | What it does | Track |
| --- | --- | --- |
| `@frigear-nu/operations` | An occasion Frigear works at (a festival bar, a venue season), with a period, location and status. | A |
| `@frigear-nu/teams` | Generic teams with members, a role ladder per team kind and role mapping rules. | A |
| `@frigear-nu/crew` | Applications, approvals and invites that turn people into an operation's crew. | A |
| `@frigear-nu/shifts` | Schedules, shifts, assignment, swaps, attendance, reminders and an iCal feed. | A |
| `@frigear-nu/dashboard` | Customisable dashboards that modules add items to. | B |
| `@frigear-nu/faq` | Managed FAQ groups with per-group and per-item visibility. | B |
| `@frigear-nu/help-center` | Help articles and onboarding checklists from the database or Nuxt Content. | B |
| `@frigear-nu/push` | Device registration and push notifications, with channel preferences. | B |
| `@frigear-nu/maps` | Geographic and floor-plan maps that modules add map kinds and layers to. | B |
| `@frigear-nu/inbox` | A two-way inbox: platform mailboxes for staff and a personal inbox per volunteer. | B |
| [`@frigear-nu/audience`](/modules/volunteering/audience) | Visibility rules, owner references and the two hooks below. Not a Nuxt module. | Shared |

The two tracks are built in parallel and never edit the same package.

## Role ladder

A volunteer climbs a ladder of [team roles](/guide/concepts/glossary). Staff above it hold global roles.

```text
Volunteer → Bartender → BA (bar manager) → Coordinator → Admin
└──────────── per operation + team (teams, crew) ────────┘   └ global staff role (authorization)
```

- **Team roles** are held per team. A person can be a BA at one bar and a volunteer at another. Teams stores
  explicit assignments, and resolves mapped ones at read time from role mapping rules.
- **Ladders are per team kind.** The `bar` kind ladder is `volunteer`, `bartender`, `ba`, `coordinator` (keys in
  lower case, lowest first). Other kinds, such as first aid or logistics, define their own.
- **Global roles** (`admin`, `manager`, `coordinator`, `barmanager`, `crew`, `member`, ...) stay in
  [Authorization](/modules/identity/authorization). They grant staff permissions such as `shifts:manage`, and feed the
  mapping rules (global `barmanager` → BA).

## Owners

An operation, a team, a user or the platform owns a record. Every table that has an owner stores it in two columns.

| Column | Type | Value |
| --- | --- | --- |
| `ownerType` | text | `'operation'`, `'team'`, `'user'`, `'platform'`, or a type another module adds |
| `ownerId` | text, nullable | The owner's id as text. `null` for `platform`. |

In code an owner is an `OwnerRef` (`{ type, id }`) from `@frigear-nu/audience`. The module that owns a type answers
the `audience:owner:resolve` hook with the owner's label and whether it exists:

| Owner type | Answered by |
| --- | --- |
| `operation` | operations |
| `team` | teams |
| `user` | nobody yet: read the user through `@frigear-nu/users` |
| `platform` | nobody: there is one platform, and the consumer labels it itself |

The hook answers no access questions. A consumer such as maps checks access with
`authorize(event, 'maps:edit', map)`, and the owning module adds a [policy](/guide/concepts/glossary) for its owner
type: operations lets an operation's coordinators edit that operation's maps. No consumer imports an owner module.

## Visibility

FAQ groups and items, help categories and articles, maps and mailboxes store who may see them in one JSON column,
`visibility`. [Audience](/modules/volunteering/audience) owns the shape and the resolver, so every module answers the
same way.

```ts
type Visibility = {
  public?: boolean
  globalRoles?: string[]
  minTeamRole?: { kind: string, role: string }
  operationId?: string
}
```

| Visibility | Who sees it |
| --- | --- |
| Empty (`null`, `{}`) | Signed-in viewers. Nothing is public unless it says so. |
| `public: true` | Everyone, anonymous visitors included. The other keys are ignored. |
| `globalRoles` | Signed-in viewers with at least one of these global roles. An empty list matches nobody. |
| `minTeamRole` | Signed-in viewers with a team role of that kind at or above `role`. |
| `operationId` | Signed-in viewers who take part in the operation: crew, or anyone with a team role on it. |
| `minTeamRole` and `operationId` | The team role must be on a team of that operation. |

Several keys combine with AND. An unknown team kind or role fails closed.

An item inside a group can only narrow the group: an FAQ item narrows its group, an article its category. The item's
effective visibility is `narrowVisibility(group, item, ladders)`:

- An empty item inherits the group.
- A public item in a restricted group stays restricted.
- `globalRoles` intersect, `operationId` must match and `minTeamRole` takes the higher role of the same kind.
- A combination that one visibility cannot hold, such as two operations or two team kinds, matches nobody.

Nuxt Content articles are always public. Restricted content comes only from the database.

## Who is looking

`isVisible` needs a viewer: the user's global roles, team roles, ladders and the operations they take part in. No
module knows all of that, so the viewer is filled in through one Nitro hook.

```text
faq / help-center / maps / inbox
        │  resolveViewer(event, { hooks, user, globalRoles })   globalRoles from auth's getEffectiveRoles
        ▼
audience:viewer:resolve ── teams      → viewer.teamRoles, viewer.ladders   (resolveTeamRoles)
                        ── crew       → viewer.operationIds
                        ── operations → viewer.operationIds                 (when it knows participation itself)
```

A module answers the hook from its own server plugin, whether or not a consumer is installed. Answering an unused hook
is harmless. This hook replaces the plan's per-module `faq:visibility`, `help-center:visibility` and
`operations:participation` hooks. A module may still add an override hook of its own later.

## Team-role contract

Teams exposes one server util, auto-imported where teams is installed:

```ts
resolveTeamRoles(event: H3Event, userId: string | number, owner: OwnerRef): Promise<TeamRoleGrant[]>

type TeamRoleGrant = {
  ownerType: OwnerType
  ownerId: string
  teamId: string
  kind: string
  role: string
  source: 'explicit' | 'mapped'
}
```

- Explicit memberships come first, then the grants of the mapping rules. Mapped grants are never stored.
- An explicit membership on a team wins over a mapped grant on the same team.
- Teams answers `audience:viewer:resolve` with the grants on every owner, plus the ladder of each team kind in them.
- Modules that only need visibility never call `resolveTeamRoles`. They call `resolveViewer` and get the grants
  through the hook, so they do not import teams.

## Hooks

Nitro runtime hooks are named `<module>:<entity>:<event>`, lower case, with kebab-case segments.

- **Something happened:** a past-tense verb, such as `created`, `approved` or `status-changed`.
- **Veto:** `before`. A listener throws to deny.
- **Provider:** `resolve`, `check` or `filter`. Listeners mutate the context.
- **Two segments** are allowed when the entity is the module's own main resource: `operations:created`, like the
  existing `forms:submitted`.
- **The context** is always one mutable object with `event`.

| Hook | Owner | Context | Phase |
| --- | --- | --- | --- |
| `audience:viewer:resolve` | audience | `{ event, user, viewer }` | 0 |
| `audience:owner:resolve` | audience | `{ event, owner, label, exists }` | 0 |
| `operations:created` | operations | `{ event, operation }` | 1 |
| `operations:updated` | operations | `{ event, operation, previous }` | 1 |
| `operations:status-changed` | operations | `{ event, operation, from, to }` | 1 |
| `dashboard:summary:resolve` | dashboard | `{ event, user, name, cards }` | 1 |
| `teams:member:added` | teams | `{ event, team, member }` | 2 |
| `teams:member:removed` | teams | `{ event, team, member }` | 2 |
| `teams:member:role-changed` | teams | `{ event, team, member, from, to }` | 2 |
| `teams:roles:resolve` | teams | `{ event, user, owner, grants }` | 2 |
| `faq:group:updated` | faq | `{ event, group }` | 2 |
| `faq:item:published` | faq | `{ event, group, item }` | 2 |
| `crew:member:applied` | crew | `{ event, operationId, member }` | 3 |
| `crew:member:approved` | crew | `{ event, operationId, member }` | 3 |
| `crew:member:rejected` | crew | `{ event, operationId, member }` | 3 |
| `crew:member:waitlisted` | crew | `{ event, operationId, member }` | 3 |
| `crew:member:withdrawn` | crew | `{ event, operationId, member }` | 3 |
| `shifts:shift:created` | shifts | `{ event, shift }` | 4 |
| `shifts:shift:updated` | shifts | `{ event, shift, previous }` | 4 |
| `shifts:assignment:changed` | shifts | `{ event, assignment, previous }` | 4 |
| `shifts:swap:offered` | shifts | `{ event, swap, offer }` | 4 |
| `shifts:swap:accepted` | shifts | `{ event, swap, offer }` | 4 |
| `shifts:swap:rejected` | shifts | `{ event, swap, offer }` | 4 |
| `shifts:attendance:marked` | shifts | `{ event, assignment, by }` | 4 |
| `push:device:registered` | push | `{ event, device }` | 4 |
| `maps:seed:resolve` | maps | `{ event, maps }` | 5 |
| `maps:feature:created` | maps | `{ event, map, feature }` | 5 |
| `maps:feature:updated` | maps | `{ event, map, feature, previous }` | 5 |
| `maps:feature:deleted` | maps | `{ event, map, feature }` | 5 |
| `inbox:message:received` | inbox | `{ event, thread, message }` | 6 |
| `inbox:message:sent` | inbox | `{ event, thread, message }` | 6 |
| `inbox:thread:assigned` | inbox | `{ event, thread, assigneeId, previous }` | 6 |
| `inbox:thread:status-changed` | inbox | `{ event, thread, from, to }` | 6 |

- **`teams:roles:resolve`.** Listeners push extra mapped grants into `grants`, for mapping sources teams does not
  know. Crew's presets are plain `team_role_mappings` rows instead.
- **`maps:seed:resolve`.** Listeners push map definitions into `maps` on startup, and maps creates the missing ones.
  To create a map when an owner is created, listen to `operations:created` and call `ensureMap`.
- **Existing hooks used here.** Crew and inbox listen to `forms:submitted`. Teams adds a `teams` claim through
  `oauth:claims`. Dashboard items are filtered by the client-side `widgets:filter`.

## Dashboard items

The dashboard module is built in phase 1. It lets any module add items to a named dashboard, and lets each user
reorder, hide and collapse them. Dashboard names are dotted, such as `crew.home`.

```ts
// @frigear-nu/dashboard/utils
extendDashboard(nuxt: Nuxt, name: string, items: DashboardItem | DashboardItem[]): void

type DashboardItem = WidgetDefinition & {
  title?: string // plain fallback title
  titleKey?: string // i18n key, translated at render time
  platforms?: ('web' | 'mobile')[] // default: both
  when?: { module?: string } | { permission?: string } | { platform?: 'web' | 'mobile' }
}
```

- `extendDashboard` adds the items to the widget area `dashboard.<name>` with `extendWidgets` from
  [Widget](/modules/interface/widget). `WidgetDefinition` is Widget's: `id`, `component`, `order`, `span`, `props`,
  `requires`, `permission`, `tags` and `meta`.
- Components always load lazily, so there is no `lazy` field. An item with the same `id` in the same dashboard
  replaces the earlier one.
- `title`, `titleKey`, `platforms` and `when` are kept in the `#dashboard/registry` virtual module, built with
  `defineVirtualRegistry` from `@frigear-nu/module-kit/utils`.
- The client `widgets:filter` hook keeps hiding items by `permission`.
- Each user's layout is one [Preferences](/modules/identity/preferences) key, `dashboardLayouts`:
  `Record<dashboardName, { order: string[], hidden: string[], collapsed: string[] }>`. Without Preferences the
  registered order applies.

A module adds items only when dashboard is installed:

```ts [module.ts]
import { hasNuxtModule } from '@nuxt/kit'

if (hasNuxtModule('@frigear-nu/dashboard')) {
  const { extendDashboard } = await import('@frigear-nu/dashboard/utils')
  extendDashboard(nuxt, 'crew.home', {
    id: 'shifts.next',
    component: resolver.resolve('./runtime/app/dashboard/NextShift.vue'),
    titleKey: 'shifts.dashboard.next',
    order: 10,
    platforms: ['web', 'mobile'],
  })
}
```

## Module dependencies

Hard dependencies go in `moduleDependencies` and `package.json`. Soft ones use `hasNuxtModule()` plus hooks and
registries, so each module also works alone. Arrows point one way: a lower module never imports a higher one.

```text
audience    (plain package, no Nuxt module)

dashboard   ─► widget, menu, auth                    (soft: preferences, mobile, admin)
operations  ─► auth, audience                        (soft: events, maps, dashboard)
teams       ─► auth, users, audience                 (soft: authorization, subscriptions, oauth-server, dashboard)
crew        ─► operations, teams, forms, notify      (soft: dashboard, mobile)
shifts      ─► crew, notify                          (soft: dashboard, push, mobile, maps)
faq         ─► auth, menu, audience                  (soft: forms, teams, crew, operations, mobile, dashboard)
help-center ─► auth, audience                        (soft: teams, crew, operations, maps, notify, push, dashboard,
                                                            @nuxt/content, faq, menu)
maps        ─► auth, audience                        (owners register kinds and layers; maps imports none of them)
inbox       ─► auth, notify, audience                (soft: forms, users, teams, push, mobile, dashboard)
push        ─► auth, users                           (soft: mobile, preferences)
```

The soft links between visibility consumers and teams, crew or operations need no import at all: they meet in
`audience:viewer:resolve`. SMS has no package of its own: modules call Notify's `dispatchSMSNotification`.

## Documentation

Each module adds one page to this group in the pull request that adds the module, and a row to the
[Modules](/modules) tables. Follow the module page templates in [Documentation](/contribute/documentation#page-templates).

## Next steps

- [Audience](/modules/volunteering/audience) – the visibility resolver and the two hooks.
- [Widget](/modules/interface/widget) – the widget areas dashboards are built on.
- [Extension points](/guide/concepts/extension-points) – how hooks and registries let modules extend each other.
- [Access control](/guide/concepts/auth-and-scopes) – the policies owner modules add.
