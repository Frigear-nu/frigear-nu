---
title: Volunteering
description: The shared contracts of the crew modules, so operations, crew and shifts fit together without importing each other.
navigation:
  title: Overview
---

The volunteering modules run crew work: the occasions Frigear staffs, the crew that work them and their shifts. Each
one is a separate module, and they plug into each other through hooks and registries instead of imports. This page is
for module authors. It holds the contracts the crew modules follow: the role ladder, notification topics, hook names,
map integrations and dashboard items.

## The modules

| Module | What it does |
| --- | --- |
| [`@frigear-nu/operations`](/modules/volunteering/operations) | An occasion Frigear works at (a festival bar, a venue season), with a period, location and status. |
| [`@frigear-nu/crew`](/modules/volunteering/crew) | Applications, approvals and invites that turn people into an operation's crew. |
| [`@frigear-nu/shifts`](/modules/volunteering/shifts) | Schedules, shifts, assignment, trades and releases, attendance and who is on shift now, with reminders, an iCal feed, broadcasts and earned perks. |

They build on modules in other categories, which other apps use without them:

| Module | Category | What the crew modules use it for |
| --- | --- | --- |
| [Teams](/modules/organisation/teams) | Organisation | The teams crew work in, and the team roles of the role ladder below. |
| [Grants](/modules/platform/grants) | Platform | Who may see a record: grant lists, where any one grant admits. Operations registers `operation`, Teams `team`. |
| [FAQ](/modules/content/faq) and [Help center](/modules/content/help-center) | Content | What volunteers read, visible per team role or operation. |
| [Push](/modules/communication/push) | Communication | The [notification topics](#notifications) crew and shifts send on. |
| [Dashboard](/modules/interface/dashboard) and [Maps](/modules/interface/maps) | Interface | The `crew.home` [dashboard](#dashboard-items) and the [maps](#maps-integrations) of an operation. |

## Role ladder

A volunteer climbs a ladder of [team roles](/guide/concepts/glossary). Staff above it hold global roles.

```text
Volunteer → Bartender → BA (bar manager) → Coordinator → Admin
└──────────── per operation + team (teams, crew) ────────┘   └ global staff role (authorization)
```

- **Team roles** are held per team. A person can be a BA at one bar and a volunteer at another. Teams stores
  explicit assignments, and resolves mapped ones at read time from role mapping rules. See
  [Team roles](/modules/organisation/teams#team-roles) for the contract.
- **Ladders are per team kind.** The `bar` kind ladder is `volunteer`, `bartender`, `ba`, `coordinator` (keys in
  lower case, lowest first). Other kinds, such as first aid or logistics, define their own.
- **Global roles** (`admin`, `manager`, `coordinator`, `barmanager`, `crew`, `member`, ...) stay in
  [Authorization](/modules/identity/authorization). They grant staff permissions such as `shifts:manage`, and feed the
  mapping rules (global `barmanager` → BA).

## Notifications

A module that tells a person something does not send email, SMS or push itself. It registers a topic at build time and
calls one helper at run time, and [Push](/modules/communication/push) sends on the channels the person chose.

```ts
// in the module's setup()
extendNotificationTopics(nuxt, [{ id: 'shifts.reminder', label: { da: 'Vagtpåmindelser', en: 'Shift reminders' }, defaults: { email: true, sms: false, push: true } }])

// in a route or task
await notifyUser(event, userId, { topic: 'shifts.reminder', email: { subject, body }, sms: { body: text }, push: { title, body: text, url } })
```

- **Topic ids** are lower case, dot separated and start with the module name: `shifts.reminder`, `inbox.message`.
- **A topic that is not registered throws**, so a typo fails in development.
- **SMS and email** go through the drivers of [Notify](/modules/communication/notify). The host app picks them.
- A module that only sends when Push is installed checks `hasNuxtModule('@frigear-nu/push')` and registers its topics
  then. The helpers are server auto-imports where Push is installed.
- **Without Push the module keeps sending itself.** Each module has one small helper at its send sites (`shiftsNotify`,
  `crewSend`, `helpCenterDeliver`). It calls `notifyUser` when Push is installed and `dispatchEmailNotification` and
  `dispatchSMSNotification` when it is not, through a server module that a build generates: `#shifts/push` and `#crew/push`, and for the help center its existing
  `#help-center/optional`. `notifyUser` is `undefined` there when Push is absent.

| Topic | Module | Offers | Default on | Send site |
| --- | --- | --- | --- | --- |
| `shifts.reminder` | shifts | email, SMS, push | email, push | The `shifts:send-reminders` task. SMS needs `reminders.sms` and the person's choice. |
| `shifts.swap` | shifts | email, push | email, push | The swap emails. |
| `shifts.broadcast` | shifts | email, SMS, push | email, push | Broadcasts. SMS needs the sender's `sms` channel and the person's choice. |
| `crew.status` | crew | email, push | email, push | The status email of an application. |
| `help-center.send` | help-center | email, push | email, push | Sending articles. A send's SMS channel is still sent directly. |

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
| `operations:created` | operations | `{ event, operation }` | 1 |
| `operations:updated` | operations | `{ event, operation, previous }` | 1 |
| `operations:status-changed` | operations | `{ event, operation, from, to }` | 1 |
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

The modules the crew modules build on list their own hooks: [Teams](/modules/organisation/teams#hooks),
[FAQ](/modules/content/faq#hooks), [Push](/modules/communication/push#hooks)
and [Dashboard](/modules/interface/dashboard#hooks). [Maps](/modules/interface/maps) has none: it is a building block.

- **Shifts hooks.** `shifts:assignment:changed` has `previous: null` for a new assignment, and fires for each
  assignment a completed swap hands over: two for a trade, one for a release. The swap hooks carry the swap's `kind`
  (`trade` or `release`, also on `swap.kind`). `shifts:schedule:published` fires once, when a draft is published; the
  shifts of a draft fire `shifts:shift:created` as they are created. With `approval: 'peer'`, `shifts:swap:accepted`
  and `shifts:swap:completed` fire in the same request. Shifts listens to `teams:member:removed` and
  `teams:member:role-changed` to cancel the future shifts of people who left a team or lost the role a shift needs.
  `shifts:reminder:sent` fires from the `shifts:send-reminders` task (so `event` is `undefined`), once per reminder that
  went out; `shifts:broadcast:sent` fires in the request that sent it.
- **Crew hooks** fire on the same transitions as the `teams:member:*` hooks of
  [Teams](/modules/organisation/teams#hooks), which follow the grant of a membership rather than the row: an
  applicant's `pending` row (applied or waitlisted) fires nothing in teams.
- **Existing hooks used here.** Crew listens to `forms:submitted`.

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

[Dashboard](/modules/interface/dashboard) lets any module add items to a named dashboard, and lets each user reorder,
hide and collapse them. The crew modules share one, `crew.home`. How to write an item, its fields and the per-user
layout are on [Dashboard](/modules/interface/dashboard#add-items-from-a-module).

Items the modules add to `crew.home`, each only when dashboard is installed and each with the permission that guards
its data:

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

The crew modules and the modules they build on. Hard dependencies go in `moduleDependencies` and `package.json`. Soft
ones use `hasNuxtModule()` plus hooks and registries, so each module also works alone. Arrows point one way: a lower module never imports a higher one.

```text
grants      ─► auth, ui

dashboard   ─► widget, ui                            (soft: preferences, mobile, auth)
operations  ─► auth, grants                          (soft: events, maps, dashboard)
teams       ─► auth, users, grants                   (soft: authorization, subscriptions, oauth-server, maps, dashboard)
crew        ─► operations, teams, forms, notify      (soft: dashboard, mobile)
shifts      ─► crew, notify                          (soft: dashboard, push, mobile, maps)
faq         ─► auth, grants                          (soft: menu, admin, forms, teams, crew, operations, mobile,
                                                            dashboard)
help-center ─► auth, grants                          (soft: teams, crew, operations, maps, notify, push, dashboard,
                                                            @nuxt/content, faq, menu, admin, widget, account, mobile)
maps        ─► auth                                  (owners register kinds and layers; maps imports none of them)
inbox       ─► auth, notify, grants                  (planned; soft: forms, users, teams, push, mobile, dashboard)
push        ─► auth, users                           (soft: mobile, preferences)
```

The soft links between grant consumers and teams, crew or operations need no import at all: they meet in the grants
registry and Operations' participation hooks. SMS has no package of its own: modules call Notify's `dispatchSMSNotification`.

## Documentation

Each module adds one page to its category in the pull request that adds the module, and a row to the
[Modules](/modules) tables. A crew module goes in this group; a module other apps use too goes in Organisation,
Content, Communication or Interface. Follow the module page templates in [Documentation](/contribute/documentation#page-templates).

## Next steps

- [Grants](/modules/platform/grants) – who may see a record, with the kinds the crew modules register.
- [Teams](/modules/organisation/teams) – the team roles of the role ladder.
- [Extension points](/guide/concepts/extension-points) – how hooks and registries let modules extend each other.
- [Access control](/guide/concepts/auth-and-scopes) – the policies owner modules add.
