---
title: Authorization
description: Roles, permissions and policies that decide what a signed-in user may do on pages, server routes and in the interface.
navigation:
  title: Overview
---

Authorization decides what a signed-in user may do. Modules and your app register **permissions** such as
`events:update`. You bundle them into **roles** (`admin`, `coordinator`, `member`), give users roles, and write a
**policy** where a rule depends on the record, for example "only the author may edit a post". Then you check the one
permission on the server, in route rules and in the interface.

Install it when your app has more than "signed in" and "admin". Who the user is comes from
[Auth](/modules/identity/auth), which also owns the engine that decides. This module adds the roles, where they are
stored, the admin pages for them, and what the browser may show. The vocabulary and the order of a check are in
[Access control](/guide/concepts/auth-and-scopes).

The package is `@frigear-nu/authorization`. It works in both [modes of Auth](/modules/identity/auth). In
[client mode](/modules/identity/authorization/client#client-mode) the same composables only decide what the app shows.

## What you get

- **Roles from config** (`authorization.roles`) merged with the roles modules ship, with inheritance, requirements and
  automatic roles. See [Roles and requirements](/modules/identity/authorization/roles-and-requirements).
- **Role assignment**: a user holds several roles, stored in `authorization_user_roles`, with a hard-coded escalation
  rule.
- **Policies**: `definePolicy` on the server and `defineSharedPolicy` for the server and the client. See
  [Policies](/modules/identity/authorization/policies).
- **The client**: `useAuthorization()`, `<Can>` and `<Cannot>`, route rules and `definePageMeta({ authorize })`, and
  filtered menus, tabs and widgets. See [Client](/modules/identity/authorization/client).
- **Roles admin** (needs [Admin](/modules/interface/admin)): read-only role pages and a "Roles and permissions" tab
  on the admin user page. See [Admin](/modules/identity/authorization/admin).

:module-runtime{server client mobile}

::note
**Installed for you:** `@frigear-nu/module-kit`, [`@frigear-nu/auth`](/modules/identity/auth) and
[`@frigear-nu/users`](/modules/identity/users) (client mode: Module Kit and Auth only).

**You add:** `@nuxthub/core` in server mode.

**Optional:** [`@frigear-nu/admin`](/modules/interface/admin), [`@frigear-nu/menu`](/modules/interface/menu) and
[`@frigear-nu/widget`](/modules/interface/widget) for the admin pages, menu filtering and the user tab.
::

::warning
Without Authorization, only `implicit` permissions apply (the self-service ones modules register, such as
`tickets:read`), plus whatever your `authorization:before` hook allows. Nothing else is allowed. Auth's route rules are
still enforced.
::

## Quick setup

::steps

### Install Authorization

```bash
pnpm add @frigear-nu/authorization @nuxthub/core
```

### Define your roles

Modules register their permissions. You decide which role holds which. This closes `/admin/**` to everyone without
the `admin:access` permission, and sends visitors to the sign-in page:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/users', '@frigear-nu/authorization'],
  routeRules: {
    '/admin/**': { permission: 'admin:access' },
    '/api/admin/**': { permission: 'admin:access' },
  },
  authorization: {
    defaultRoles: ['user'], // every signed-in user holds these
    roles: {
      admin: { label: 'Admin', grant: ['*'] },
      user: { label: 'User', grant: ['events:read'] },
    },
    redirectTo: '/login', // unauthenticated page visits; client mode defaults to the login path
  },
})
```

### Generate the migration

:::warning
Without a [migration](/guide/concepts/glossary), role assignment fails: the database lacks the
`authorization_user_roles` and `authorization_meta` tables.
:::

```bash
pnpm db:generate
```

Module authors do the same in every [test fixture](/guide/concepts/glossary) that installs it. See
[Database extensions](/guide/concepts/database-extensions).

### Check a permission

On the server, authorize before loading, then again with the record:

```ts [server/api/posts/[id].put.ts]
import { intIdParams } from '@frigear-nu/module-kit/server'

export default defineEventHandler(async (event) => {
  await authorize(event, 'posts:update') // 401 or 403 before anything is loaded
  const { id } = await getValidatedRouterParams(event, intIdParams().parse)
  const post = await findPost(id) // 404 only now
  await authorize(event, 'posts:update', post) // policies see the record
})
```

In the app, show the button only to users who may use it:

```vue
<Can permission="posts:update" :record="post">
  <button>Edit</button>
</Can>
```

`findPost` and `Post` stand for your own code, and `posts:update` has to be registered with `addPermission` first.

::

::callout{color="success" icon="i-lucide-check"}
**What you should see:** a visitor who opens a page under `/admin/` lands on `/login`, with the page in `?redirect=`.
A signed-in user without `admin:access` gets a `403` there.
::

## Options

Options go under the `authorization` key.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `roles` | `Record<string, RoleDefinition>` | `{}` | The app's roles. Merged with the roles modules ship. See [Roles and requirements](/modules/identity/authorization/roles-and-requirements). |
| `defaultRoles` | `string[]` | `[]` | Roles every signed-in user holds. They cannot be assigned, and cannot be `auto` roles. |
| `policies.shared` | `string \| false` | `shared/policies.ts` when it exists | The file of `defineSharedPolicy` exports, run on the server and in the client's `can()`. |
| `policies.server` | `string \| false` | `server/policies.ts` when it exists | The file of `definePolicy` exports, run on the server only. |
| `redirectTo` | `string \| false` | client mode: Auth's sign-in path | Where an unauthenticated page visit goes. |

**`redirectTo`.** The requested page goes along in `?redirect=`, checked by the shared
[redirect rule](/modules/identity/auth/reference#redirects). In server mode without the option, or with `false`, a
`401` error is shown instead.

**`roles` and `defaultRoles`.** A role's definition is
`{ label?, labelKey?, description?, descriptionKey?, grant?, inherit?, requirements?, auto?, assignable?, replace? }`.
All of it is explained on the next page. The formatted example below is a complete host configuration:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  authorization: {
    defaultRoles: ['user'],
    roles: {
      admin: {
        label: 'Admin',
        labelKey: 'authorization.roles.admin',
        grant: ['*'], // '*' never covers sensitive (:pii) permissions: grant those by name
      },
      manager: {
        label: 'Coordinator',
        labelKey: 'authorization.roles.manager',
        grant: ['forms:*', 'users:read', 'users:list'],
        inherit: ['eventmanager', 'crew'],
      },
      eventmanager: {
        label: 'Event Manager',
        grant: ['events:*'],
        inherit: ['user'],
      },
      crew: {
        label: 'Crew',
        grant: ['events:read'],
        inherit: ['user'],
      },
      member: {
        label: 'Member',
        grant: ['member-area:view'],
        requirements: { subscription: '*' }, // counts only while every requirement holds
        auto: true, // held by everyone meeting the requirements; not assignable
        inherit: ['user'],
      },
      user: {
        label: 'User',
        grant: ['events:read'],
      },
    },
  },
  oauthServer: {
    scopes: [
      // a named scope is a group of permissions (never sensitive or sessionOnly ones)
      { name: 'tickets', label: 'Your tickets', permissions: ['tickets:read', 'tickets:write'] },
    ],
    settings: {
      roleScopes: { // the most each role may grant to a client
        admin: ['*'],
        user: ['openid', 'profile', 'profile:read', 'profile:write', 'tickets:read', 'tickets:write'],
      },
    },
  },
})
```

Every grant has to name a registered permission, and every role in `inherit` has to exist: the build stops
otherwise.

::note
Removed options: `rbac`, `abilities`, `resolvers`, and `roles.{hierarchy, inherits, revoke, labels, descriptions,
definitions, defaultRole}`. See [Migrate access control](/guide/going-further/migrate-access-control).
::

## Hooks

Your app answers these Nitro hooks from a server plugin (`server/plugins/*.ts`).

| Hook | Package | When | Payload |
| --- | --- | --- | --- |
| `authorization:before` | Auth | A permission check passes the credential's own limits | `{ event, principal, user, permission, record, allow(), deny() }`. The single host override. |
| `authorization:roles` | Auth | A user's roles are resolved, once per request | `{ event, user, roles }`. Push to or remove from `roles`. |

[The before hook](/guide/concepts/auth-and-scopes#the-before-hook) explains `authorization:before`.
`authorization:roles` is on [Roles and requirements](/modules/identity/authorization/roles-and-requirements#where-a-users-roles-come-from).

## Routes

Routes the module registers, and who may call them. Paths come from `authorizationApi` in
`@frigear-nu/authorization/api`. The caller's own access, `GET /api/auth/me/access`, belongs to
[Auth](/modules/identity/auth/reference#routes).

| Method | Path | Who | Answers |
| --- | --- | --- | --- |
| `GET` | `/api/admin/authorization/roles` (`admin.roles`) | `roles:read` | Every role, most senior first, with its user count. |
| `GET` | `/api/admin/authorization/roles/:name` (`admin.role(name)`) | `roles:read` | One role: every registered permission, whether it holds it and why. `404` for an unknown role. |
| `GET` | `/api/admin/authorization/roles/:name/users` (`admin.roleUsers(name)`) | `roles:read` | The users with that role assigned, paginated. |
| `GET` | `/api/admin/authorization/users/:id/roles` (`admin.userRoles(id)`) | `roles:read` or `roles:assign` | A user's assigned and effective roles, their permissions, and the roles the caller may assign. |
| `PUT` | `/api/admin/authorization/users/:id/roles` (`admin.userRoles(id)`) | `roles:assign` (session only) | Replaces the roles assigned by staff. `400 unknown_role`, `403 forbidden`, `409 role_not_assignable`. |

## Permissions

| Permission | Flags | Default grant | Allows |
| --- | --- | --- | --- |
| `roles:read` | | `admin` through `*` | See the roles, what each may do and who has them. |
| `roles:assign` | `sessionOnly` | `admin` through `*` | Give users roles and take them away, within your own permissions. |

The sensitive permissions of other modules (`events:pii`, `forms:pii`) are sensitive (MCP only): they gate personal data
in MCP tool output, while the admin HTTP API is gated by `events:manage` and `forms:manage`. Grant them by name.

## Database

Tables the module adds. Generate and commit a [migration](/get-started/database#migrations) after installing. Both
exist for SQLite and PostgreSQL.

| Table | Holds |
| --- | --- |
| `authorization_user_roles` | One row per assigned role: `user_id`, `role`, `source` (`manual`, `sso` or `migrated`), `granted_by`, `created_at`. Primary key `(user_id, role)`. |
| `authorization_meta` | Markers of one-off tasks, such as the `users.role` migration. |

The `users.role` column is still added to the `users` table, for the one-off migration only. Nothing reads it as a live
role, and a later release drops it. See
[the role migration](/modules/identity/authorization/roles-and-requirements#the-usersrole-migration).

## Next steps

- [Roles and requirements](/modules/identity/authorization/roles-and-requirements) – how roles are built and assigned.
- [Policies](/modules/identity/authorization/policies) – refine a permission for one record.
- [Client](/modules/identity/authorization/client) – `useAuthorization()`, `<Can>` and route rules.
- [Admin](/modules/identity/authorization/admin) – the roles pages and the user roles tab.
- [Protect a route](/examples/tasks/protect-a-route) – the two-step route in context.
- [Authentication](/get-started/authentication#_4-roles-and-the-first-admin) – make the first user an admin.
