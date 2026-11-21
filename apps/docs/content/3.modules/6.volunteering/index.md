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

The packages that exist today are [Audience](/modules/volunteering/audience), the shared visibility rules,
[Operations](/modules/volunteering/operations), [Dashboard](/modules/volunteering/dashboard),
[Teams](/modules/volunteering/teams), [FAQ](/modules/volunteering/faq), [Crew](/modules/volunteering/crew),
[Help center](/modules/volunteering/help-center), [Push](/modules/volunteering/push),
[Shifts](/modules/volunteering/shifts) and [Maps](/modules/volunteering/maps). Every other module adds its own page to
this group in the pull request that adds the module.

## The modules

| Module | What it does | Track |
| --- | --- | --- |
| [`@frigear-nu/operations`](/modules/volunteering/operations) | An occasion Frigear works at (a festival bar, a venue season), with a period, location and status. | A |
| [`@frigear-nu/teams`](/modules/volunteering/teams) | Generic teams with members, a role ladder per team kind and role mapping rules. | A |
| [`@frigear-nu/crew`](/modules/volunteering/crew) | Applications, approvals and invites that turn people into an operation's crew. | A |
| [`@frigear-nu/shifts`](/modules/volunteering/shifts) | Schedules, shifts, assignment, trades and releases, attendance and who is on shift now, with reminders, an iCal feed, broadcasts and meal vouchers. | A |
| [`@frigear-nu/dashboard`](/modules/volunteering/dashboard) | Customisable dashboards that modules add items to. | B |
| [`@frigear-nu/faq`](/modules/volunteering/faq) | Managed FAQ groups with per-group and per-item visibility. | B |
| [`@frigear-nu/help-center`](/modules/volunteering/help-center) | Help articles and onboarding checklists from the database or Nuxt Content. | B |
| [`@frigear-nu/push`](/modules/volunteering/push) | Device registration and push notifications, with channel preferences. | B |
| [`@frigear-nu/maps`](/modules/volunteering/maps) | Geographic and floor-plan maps that modules add map kinds and layers to. | B |
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

`ownerType` is never null. A record with no other owner is `ownerType: 'platform'` with `ownerId: null`.

In code an owner is an `OwnerRef` (`{ type, id }`) from `@frigear-nu/audience`. The module that owns a type answers
the `audience:owner:resolve` hook with the owner's label and whether it exists:

| Owner type | Answered by |
| --- | --- |
| `operation` | operations |
| `team` | teams |
| `user` | nobody yet: read the user through `@frigear-nu/users` |
| `platform` | nobody: there is one platform, and the consumer labels it itself |

The hook answers no access questions. A consumer such as maps checks access with
`authorize(event, 'maps:edit', map)`, and the owning module answers the consumer's own hook for its owner type:
operations sets `allowed` in `maps:edit:resolve` for an operation's coordinators, teams for a team's leads. No consumer
imports an owner module.

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
| `minTeamRole` | Signed-in viewers with a team role of that kind at or above `role`. Explicit and mapped grants count. |
| `operationId` | Signed-in viewers who take part in the operation: crew, or anyone with an explicit team role on it. Mapped grants do not count. |
| `minTeamRole` and `operationId` | The team role must be on a team of that operation. |

Several keys combine with AND. An unknown team kind or role fails closed.

Participation leaves out mapped grants on purpose. A mapping rule such as "member with a plan is a volunteer" gives
every plan member a team role, but it does not make them crew of the operation.

The JSON holds only these keys. Read it with `parseVisibility`: its schema is strict, so an unknown key (a typo, or a
`permission`) hides the record instead of showing it to every signed-in user. There is no `permission` key. Maps
stores `{ public, permission }` and inbox `roles/permission` in the plan; both keep only visibility keys in the JSON,
and check permissions with `authorize(event, permission, record)` and their policies.

An item inside a group can only narrow the group: an FAQ item narrows its group, an article its category.

- **Access decisions** check both: `isVisible(group, viewer)`, and `isVisible(item, viewer)` unless the item is empty
  and inherits.
- **Storing or showing** one effective value uses `narrowVisibility(group, item, ladders)`. It is a conservative
  approximation of "group AND item": never wider, sometimes narrower.

`narrowVisibility` combines like this:

- An empty item inherits the group.
- A public item in a restricted group stays restricted.
- `globalRoles` intersect, which is stricter than "any of each" when the lists only overlap.
- `operationId` must match. A group's `minTeamRole` with an item's `operationId` becomes scoped to that operation.
- `minTeamRole` takes the higher role of the same kind.
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
  ownerId: string | null // null for a platform-owned team, as in OwnerRef
  teamId: string
  kind: string
  role: string
  source: 'explicit' | 'mapped'
}
```

- Explicit memberships come first, then the grants of the mapping rules. Mapped grants are never stored.
- An explicit membership on a team wins over a mapped grant on the same team.
- **Membership status.** A `team_members` row grants its role only when its `status` is `null` or `'active'`. Any
  other value (`'pending'`, `'inactive'`, ...) keeps the person listed on the team without a grant: no read, no lead,
  nothing in the viewer. Crew sets teams' `status` next to its own crew status. A mapping rule may still give such a
  person a mapped role.
- Mapped grants are resolved per request: every call reads the mapping rules and the user's global roles and plans.
  Call `resolveTeamRoles` (and `resolveViewer`) once per request and reuse the result, not once per record.
- Teams answers `audience:viewer:resolve` with the grants on every owner, plus the ladder of each team kind in them.
- Modules that only need visibility never call `resolveTeamRoles`. They call `resolveViewer` and get the grants
  through the hook, so they do not import teams.

## Notifications

A module that tells a person something does not send email, SMS or push itself. It registers a topic at build time and
calls one helper at run time, and [Push](/modules/volunteering/push) sends on the channels the person chose.

```ts
// in the module's setup()
extendNotificationTopics(nuxt, [{ id: 'shifts.reminder', label: { da: 'Vagtpåmindelser', en: 'Shift reminders' }, defaults: { email: true, sms: false, push: true } }])

// in a route or task
await notifyUser(event, userId, { topic: 'shifts.reminder', email: { subject, body }, sms: { body: text }, push: { title, body: text, url } })
```

- **Topic ids** are lower case, dot separated and start with the module name: `shifts.reminder`, `inbox.message`.
- **A topic that is not registered throws**, so a typo fails in development.
- **SMS and email** go through the drivers of [Notify](/modules/platform/notify). The host app picks them.
- A module that only sends when Push is installed checks `hasNuxtModule('@frigear-nu/push')` and registers its topics
  then. The helpers are server auto-imports where Push is installed.

## Hooks

Nitro runtime hooks are named `<module>:<entity>:<event>`, lower case, with kebab-case segments.

- **Something happened:** a past-tense verb, such as `created`, `approved` or `status-changed`.
- **Veto:** `before`. A listener throws to deny.
- **Provider:** `resolve`, `check` or `filter`. Listeners mutate the context.
- **Two segments** are allowed when the entity is the module's own main resource: `operations:created`, like the
  existing `forms:submitted`.
- **The context** is always one mutable object with `event`. Two exceptions: `teams:roles:resolve` has `event:
  undefined` while teams builds an OAuth claim, and `shifts:reminder:sent` has `event` always `undefined`
  (type `H3Event | undefined`) because the reminder task has no request. Both run outside a request, so a listener never reads the session from them.

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
| `teams:roles:resolve` | teams | `{ event, user, owner, globalRoles, rules, teams, ladders, grants }` | 2 |
| `teams:members:candidates` | teams | `{ event, team, rules, userIds }` | 2 |
| `faq:group:updated` | faq | `{ event, group }` | 2 |
| `faq:item:published` | faq | `{ event, group, item }` | 2 |
| `help-center:audience:resolve` | help-center | `{ event, audience, userIds }` | 3 |
| `crew:member:applied` | crew | `{ event, operationId, member }` | 3 |
| `crew:member:approved` | crew | `{ event, operationId, member }` | 3 |
| `crew:member:rejected` | crew | `{ event, operationId, member }` | 3 |
| `crew:member:waitlisted` | crew | `{ event, operationId, member }` | 3 |
| `crew:member:withdrawn` | crew | `{ event, operationId, member }` | 3 |
| `shifts:schedule:published` | shifts | `{ event, schedule }` | 4 |
| `shifts:shift:created` | shifts | `{ event, shift }` | 4 |
| `shifts:shift:updated` | shifts | `{ event, shift, previous }` | 4 |
| `shifts:assignment:changed` | shifts | `{ event, assignment, previous }` | 4 |
| `shifts:swap:offered` | shifts | `{ event, kind, swap, offer }` | 4 |
| `shifts:swap:accepted` | shifts | `{ event, kind, swap, offer }` | 4 |
| `shifts:swap:rejected` | shifts | `{ event, kind, swap, offer }` | 4 |
| `shifts:swap:completed` | shifts | `{ event, kind, swap, offer }` | 4 |
| `shifts:attendance:marked` | shifts | `{ event, assignment, by }` | 4 |
| `shifts:reminder:sent` | shifts | `{ event, assignment, offset, channels }`, `event` always `undefined` when fired from the task | 5 |
| `shifts:broadcast:sent` | shifts | `{ event, broadcast }` | 5 |
| `shifts:perk:redeemed` | shifts | `{ event, perk, redemption }` | 5 |
| `push:device:registered` | push | `{ event, device }` | 4 |
| `maps:seed:resolve` | maps | `{ event, maps }` | 5 |
| `maps:edit:resolve` | maps | `{ event, user, map, allowed }` | 5 |
| `maps:feature:created` | maps | `{ event, map, feature }` | 5 |
| `maps:feature:updated` | maps | `{ event, map, feature, previous }` | 5 |
| `maps:feature:deleted` | maps | `{ event, map, feature }` | 5 |
| `inbox:message:received` | inbox | `{ event, thread, message }` | 6: platform mailboxes; 7: user mailboxes |
| `inbox:message:sent` | inbox | `{ event, thread, message }` | 6: platform mailboxes; 7: user mailboxes |
| `inbox:thread:assigned` | inbox | `{ event, thread, assigneeId, previous }` | 6: platform mailboxes only |
| `inbox:thread:status-changed` | inbox | `{ event, thread, from, to }` | 6: platform mailboxes; 7: user mailboxes |

- **`teams:roles:resolve`.** Listeners push extra mapped grants into `grants`, for mapping sources teams does not
  know. Crew's presets are plain `team_role_mappings` rows instead. `owner` is `null`: one resolution covers every
  owner. `rules` are the mapping rules in play and `teams` the teams they cover, so the hook only fires when there are
  rules. `event` is `undefined` while an OAuth claim is built. A listener that throws loses the grants it pushed; the
  explicit memberships and teams' own role rules still count.
- **`teams:member:*`.** They follow the grant of an explicit membership, not the row: `added` when it starts granting
  (added with `status` null or `'active'`, or its status became one of those), `removed` when it stops (removed while
  granting, or its status left them), `role-changed` for a role change while it grants. Crew fires on the same
  transitions, so an applicant's `pending` row (applied or waitlisted) fires nothing. Mapped grants fire none of them.
- **Shifts hooks.** `shifts:assignment:changed` has `previous: null` for a new assignment, and fires for each
  assignment a completed swap hands over: two for a trade, one for a release. The swap hooks carry the swap's `kind`
  (`trade` or `release`, also on `swap.kind`). `shifts:schedule:published` fires once, when a draft is published; the
  shifts of a draft fire `shifts:shift:created` as they are created. With `approval: 'peer'`, `shifts:swap:accepted`
  and `shifts:swap:completed` fire in the same request. Shifts listens to `teams:member:removed` and
  `teams:member:role-changed` to cancel the future shifts of people who left a team or lost the role a shift needs.
  `shifts:reminder:sent` fires from the `shifts:send-reminders` task (so `event` is `undefined`), once per reminder that
  went out; `shifts:broadcast:sent` and `shifts:perk:redeemed` fire in the request that sent or redeemed.
- **`teams:members:candidates`.** Listeners add the ids of users who may hold a mapped role on a team, so mapped
  members can be listed. Teams adds Authorization's assigned roles and the subscribers of mapped plans itself.
- **`maps:seed:resolve`.** Listeners push map definitions into `maps` on the first request, and maps creates the
  missing ones. To create a map when an owner is created, listen to `operations:created` and call `ensureMap`.
- **`maps:edit:resolve`.** Asked when a caller holds neither `maps:manage` nor the map kind's `editPermission`. The
  module that owns the map's owner type sets `allowed = true` for its leads; it never needs to import maps. Operations
  answers for `operation` maps (holders of `operations:manage`) and teams for `team` maps (the team's leads), each only
  when maps is installed. The user is `ctx.user`.
- **Existing hooks used here.** Crew and inbox listen to `forms:submitted`. Teams adds a `teams` claim through
  `oauth:claims`. Dashboard items are filtered by the client-side `widgets:filter`.

## Maps integrations

Phase 6 wires the modules to maps. Each integration is optional: a module registers it only when
`hasNuxtModule('@frigear-nu/maps')`, and maps imports none of them.

| Module | Registers | Where |
| --- | --- | --- |
| operations | Kinds `operations.site` (geo) and `operations.venue-layout` (plane), both with owner type `operation`. | `extendMaps` in `setup()` |
| operations | One map of each kind per new operation, keys `operation-<id>-site` and `operation-<id>-venue`, created with `ensureMap` on `operations:created`. | Server plugin |
| operations | `maps:edit:resolve`: `allowed = true` for holders of `operations:manage`, on `operation` maps. | Server plugin |
| teams | `maps:edit:resolve`: `allowed = true` for the team's leads (`isTeamLead`), on `team` maps. | Server plugin |
| shifts | Layer `shifts.on-duty` on `operations.venue-layout`, permission `shifts:read`, `refreshInterval: 120`: a point per shift location, with `shifts:pii` for names. | `extendMaps` in `setup()` |

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
  when?: { module?: string, platform?: 'web' | 'mobile' } // every key that is set must hold
}
```

- `extendDashboard` adds the items to the widget area `dashboard.<name>` with `extendWidgets` from
  [Widget](/modules/interface/widget). `WidgetDefinition` is Widget's: `id`, `component`, `order`, `span`, `props`,
  `requires`, `permission`, `tags` and `meta`.
- Components always load lazily, so there is no `lazy` field. An item with the same `id` in the same dashboard
  replaces the earlier one.
- `title`, `titleKey`, `platforms` and `when` are kept in the `#dashboard/registry` virtual module, built with
  `defineVirtualRegistry` from `@frigear-nu/module-kit/utils`.
- `when` is one object whose set keys are ANDed: `module` (the item shows only when that module is installed) and
  `platform`. It has no `permission`: put that on the item's own `permission`.
- The client `widgets:filter` hook keeps hiding items by `permission`.
- Each user's layout is one [Preferences](/modules/identity/preferences) key, `dashboardLayouts`. Dashboard declares
  it with `definePreferences` (a zod schema of
  `Record<dashboardName, { order: string[], hidden: string[], collapsed: string[], settings? }>`, where `settings`
  holds per-item settings by item id) and registers it with `addUserPreferences(nuxt, { path })` when Preferences is
  installed. Without Preferences, or signed out, changes last for the session and the registered order applies after a
  reload. See [Dashboard](/modules/volunteering/dashboard#per-user-layout).

Items the volunteering modules add to `crew.home`, each only when dashboard is installed and each with the permission
that guards its data:

| Item | Module | Permission | Shows |
| --- | --- | --- | --- |
| `crew.status` | crew | `crew:read` | My application status, with a link to `/crew/status`. |
| `shifts.next` | shifts | `shifts:read` | My next shift, with the pass link. |
| `shifts.on-now` | shifts | `shifts:read` | My teams on shift now (`GET /api/shifts/me/now`). |
| `shifts.swaps` | shifts | `shifts:read` | Open swaps I can take. |
| `operations.upcoming` | operations | `operations:read` | Upcoming operations I take part in. |
| `teams.mine` | teams | `teams:read` | My teams and roles (`GET /api/teams/me`). |
| `help-center.onboarding` | help-center | `help-center:read` | My onboarding progress, next to the `account.overview` widget. |

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

dashboard   ─► widget, ui                            (soft: preferences, mobile, auth)
operations  ─► auth, audience                        (soft: events, maps, dashboard)
teams       ─► auth, users, audience                 (soft: authorization, subscriptions, oauth-server, maps, dashboard)
crew        ─► operations, teams, forms, notify      (soft: dashboard, mobile)
shifts      ─► crew, notify                          (soft: dashboard, push, mobile, maps)
faq         ─► auth, audience                        (soft: menu, admin, forms, teams, crew, operations, mobile,
                                                            dashboard)
help-center ─► auth, audience                        (soft: teams, crew, operations, maps, notify, push, dashboard,
                                                            @nuxt/content, faq, menu, admin, widget, account, mobile)
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

- [Widget](/modules/interface/widget) – the widget areas dashboards are built on.
- [Extension points](/guide/concepts/extension-points) – how hooks and registries let modules extend each other.
- [Access control](/guide/concepts/auth-and-scopes) – the policies owner modules add.
