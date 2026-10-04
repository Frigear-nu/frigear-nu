# @frigar-nu/module-kit

A simple nuxt module to simplify development of other nuxt modules within frigear.

## Purpose

- Be a shared module kit for building nuxt modules within frigear – as generic as possible within the frigear requirements
- E.g building a 'user' or 'blog' or 'post' module for frigear-nu

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

### Database schema helpers

These helpers let one module own a Drizzle table while letting other modules (and host applications) extend it with
additional columns, without the owning module needing to know about them.

#### `registerDatabaseTable`

Modules register a table schema using `registerDatabaseTable`. The simplest usage needs no wrapper at all — `schema`
can be a *regular* drizzle file:

```ts
// runtime/db/schema.sqlite.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer().primaryKey({ autoIncrement: true }),
  email: text().notNull().unique(),
})
```

```ts
import { registerDatabaseTable } from '@frigear-nu/module-kit/utils'

registerDatabaseTable(nuxt, {
  name: 'users',
  resolver: createResolver(import.meta.url),
  schema: dialect => `./runtime/db/schema.${dialect}`,
})
```

#### `extendDatabaseTable`

Other modules can register column files during setup. These can be regular files too — either a full table
definition or a plain columns object, both without any helper wrapper:

```ts
import { extendDatabaseTable } from '@frigear-nu/module-kit/utils'

extendDatabaseTable(nuxt, {
  name: 'users',
  resolver: createResolver(import.meta.url),
  file: dialect => `./runtime/db/extra.${dialect}`,
})
```

```ts
// runtime/db/extra.sqlite.ts
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  locale: text().default('da'),
})
```

Module-kit parses each file's exported table (or plain object) matching `name`, and merges their columns directly —
later registrations override columns from earlier ones with the same key — before generating a single `sqliteTable(...)`
call with the merged columns and deduplicated imports. The base `schema` file must export a genuine table call (e.g.
`sqliteTable('users', { ... })`) matching `name`, since it determines which factory (`sqliteTable`/`pgTable`/etc.) and
SQL table name to use for the merged result.

`name` also accepts an array, so a single `file` can export extension columns for several tables in one go, the same
way `registerDatabaseTable` does:

```ts
extendDatabaseTable(nuxt, {
  name: ['users', 'userPasskeys'],
  resolver: createResolver(import.meta.url),
  file: dialect => `./runtime/db/extra.${dialect}`,
})
```

```ts
// runtime/db/extra.sqlite.ts
export const users = sqliteTable('users', {
  locale: text().default('da'),
})
export const userPasskeys = sqliteTable('user_passkeys', {
  label: text(),
})
```

`name` can also be omitted entirely, in which case `file` is registered against every table that generates a schema -
whichever table(s) it actually has a matching export for pick up its columns, exactly as the shared Nuxt-layer
`server/db/extend.<dialect>.ts` files already do; tables with no matching export in `file` are left untouched:

```ts
extendDatabaseTable(nuxt, {
  resolver: createResolver(import.meta.url),
  file: dialect => `./runtime/db/extra.${dialect}`,
})
```

#### Using a `factory`

Pass `factory` to `registerDatabaseTable` when you need shared defaults (e.g. timestamps) applied consistently across
dialects. Wrap the factory with `defineExtendableTable` so it receives a single `{ name, columns }` object instead of
a plain columns object — passing `name` through means the table's name only has to be maintained in one place, the
`registerDatabaseTable` call, instead of being duplicated as a string literal inside the factory itself. The factory
must spread `columns` *last*, after its own fields (including timestamps), so extended columns always end up last in
the generated migration:

```ts
import type { ColumnBuilderBase } from 'drizzle-orm'
import { defineExtendableTable } from '@frigear-nu/module-kit/utils'

const defineUsersTable = defineExtendableTable(({ name, columns }: { name: string, columns: Record<string, ColumnBuilderBase> }) => {
  return sqliteTable(name, {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    ...columns,
  })
})
```

```ts
registerDatabaseTable(nuxt, {
  name: 'users',
  factory: 'defineUsersTable',
  resolver: createResolver(import.meta.url),
  schema: dialect => `./runtime/db/schema.${dialect}`,
  override: options.settings?.schemas?.users,
})
```

#### `defineTableColumns`

A typed identity helper for defining a table's extension columns. Each extension file exports column objects named
for their tables. For example, a Nuxt layer can extend several tables in `server/db/extend.sqlite.ts`:

```ts
import { defineTableColumns } from '@frigear-nu/module-kit/utils'

export const users = defineTableColumns({ locale: text().default('da') })
export const posts = defineTableColumns({ summary: text() })
```

Only the export matching the table being built is used. Existing registered files are merged in registration order
(later fields replace earlier fields); missing files for a dialect are skipped. Registered files with legacy default
exports still work. Nuxt layer files are merged next, from base layers toward the host application. Older
`server/db/<name>.extend.<dialect>` files with default exports are also loaded before each layer's shared file, so a
shared export can override them. Pass `extensionFile: dialect => 'path/to/columns.' + dialect + '.ts'` to change the
per-layer file location. If `override` is a path instead of `'default'`, the host schema replaces the generated table
entirely; the path is resolved from the application's root directory.
