---
title: Module Kit
description: Helpers for building Frigear Nuxt modules and extending database schemas.
---

## `@frigear-nu/module-kit`

A shared toolkit for building Nuxt modules in the Frigear workspace. It provides helpers for composing and
extending database schemas, as well as small utilities for registering modules, pages, and URLs, while keeping
table-specific behavior in the modules that own those tables.

### Purpose

- Share common module-development utilities across Frigear packages.
- Let one module add columns to a table owned by another module without replacing its schema.

This Nuxt module is consumed by modules such as [`@frigear-nu/users`](/modules/users).

## Utils & composables

All of the helpers below are exported from `@frigear-nu/module-kit/utils`.

### Module helpers

#### `registerModule`

Registers a module name against `nuxt.options.moduleKit._modules`, de-duplicating entries. Useful during a module's
`setup()` to keep track of which Frigear modules are active in the current Nuxt app:

```ts
import { registerModule } from '@frigear-nu/module-kit/utils'

registerModule('@frigear-nu/users', nuxt)
```

#### `defineModulePage`

Tags a `NuxtPage` with the owning module's name in `page.meta.moduleName`, so pages registered by a module can be
identified later (e.g. for navigation or permission checks):

```ts
import { defineModulePage } from '@frigear-nu/module-kit/utils'

extendPages((pages) => {
  pages.push(defineModulePage('@frigear-nu/users', {
    name: 'users-profile',
    path: '/users/profile',
    file: resolver.resolve('./runtime/pages/profile.vue'),
  }))
})
```

### URL helpers

#### `moduleUrl` and `moduleApiUrl`

Build consistent, kebab-cased URLs for a module's pages and API routes. If `path` starts with `/` it is treated as
absolute and the module name is not prefixed:

```ts
import { moduleUrl, moduleApiUrl } from '@frigear-nu/module-kit/utils'

moduleUrl('OAuthServer') // => '/o-auth-server'
moduleUrl('OAuthServer', 'login') // => '/o-auth-server/login'
moduleApiUrl('OAuthServer', 'token') // => '/api/o-auth-server/token'
```

## Extending a database table

These helpers let one module own a Drizzle table while letting other modules (and host applications) extend it with
additional columns, without the owning module needing to know about them.

### `defineTable`

Wraps a Drizzle table factory so it accepts an `extras` object of additional columns. The factory must spread
`extras` *last*, after its own fields (including timestamps), so extended columns always end up last in the
generated migration, matching the order they were registered in:

```ts
import type { ColumnBuilderBase } from 'drizzle-orm'
import { defineTable } from '@frigear-nu/module-kit/utils'

const defineUsersTable = defineTable((extras: Record<string, ColumnBuilderBase>) => {
  return sqliteTable('users', {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    ...extras || {},
  })
})
```

### `extendDatabaseTable`

The table-owning module registers its schema with `extendDatabaseTable`. It generates the table by importing the
named `factory` from `schema`, merging in any columns registered through `registerDatabaseTableExtension` and any
Nuxt-layer extension files, then calling the factory:

```ts
extendDatabaseTable(nuxt, {
  name: 'users',
  factory: 'defineUsersTable',
  resolver: createResolver(import.meta.url),
  schema: dialect => `./runtime/db/schema.${dialect}`,
  override: options.settings?.schemas?.users,
})
```

### `registerDatabaseTableExtension`

Other modules can register column files during setup:

```ts
registerDatabaseTableExtension(nuxt, {
  name: 'users',
  resolver: createResolver(import.meta.url),
  file: dialect => `./runtime/db/extra.${dialect}`,
})
```

### `defineExtendedColumns`

A typed identity helper for defining a table's extension columns. Each extension file exports column objects named
for their tables. For example, a Nuxt layer can extend multiple tables in `server/db/extend.sqlite.ts`:

```ts
export const users = defineExtendedColumns({ locale: text().default('da') })
export const posts = defineExtendedColumns({ summary: text() })
```

Only the export matching the table being built is used. Existing registered files are merged in registration order
(later fields replace earlier fields); missing files for a dialect are skipped. Registered files with legacy default
exports still work. Nuxt layer files are merged next, from base layers toward the host application. Older
`server/db/<name>.extend.<dialect>` files with default exports are also loaded before each layer's shared file, so a
shared export can override them. Pass `extensionFile: dialect => 'path/to/columns.' + dialect + '.ts'` to change the
per-layer file location. If `override` is a path instead of `'default'`, the host schema replaces the generated table
entirely; the path is resolved from the application's root directory.

### `extendDatabaseSchema`

Lower-level primitive behind `extendDatabaseTable`. Registers a callback on the `hub:db:schema:extend` hook, which
receives the current `dialect` and the `paths` array of schema files to include in the generated database schema.
Most modules should use `extendDatabaseTable` instead, unless they need full control over how their schema file is
built.
