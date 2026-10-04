# @frigar-nu/module-kit

A simple nuxt module to simplify development of other nuxt modules within frigear.

## Purpose

- Be a shared module kit for building nuxt modules within frigear – as generic as possible within the frigear requirements
- E.g building a 'user' or 'blog' or 'post' module for frigear-nu

## Extending a database table

Modules can register a table schema using `extendDatabaseTable` from `@frigear-nu/module-kit/utils`:

```ts
import { extendDatabaseTable } from '@frigear-nu/module-kit/utils'

extendDatabaseTable(nuxt, {
  name: 'users',
  factory: 'defineUsersTable',
  resolver: createResolver(import.meta.url),
  schema: dialect => `./runtime/db/schema.${dialect}`,
  override: options.settings?.schemas?.users,
})
```

```ts
import { ColumnBuilderBase } from "drizzle-orm";
import { defineTable } from "@frigear-nu/module-kit/utils"

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



The schema file exports the named factory, which accepts an object of additional columns and returns a table. The factory must spread the received `extra` columns *last* in the object passed to the table builder (after every one of its own fields, including timestamps), so extended columns always end up last in the generated migration, matching the order they were registered in. Other modules can register column files during setup:

```ts
import { registerDatabaseTableExtension } from '@frigear-nu/module-kit/utils'

registerDatabaseTableExtension(nuxt, {
  name: 'users',
  resolver: createResolver(import.meta.url),
  file: dialect => `./runtime/db/extra.${dialect}`,
})
```

Each extension file exports column objects named for their tables. For example, a Nuxt layer can extend several tables in `server/db/extend.sqlite.ts`:

```ts
export const users = defineExtendedColumns({ locale: text().default('da') })
export const posts = defineExtendedColumns({ summary: text() })
```

Only the export matching the table being built is used. Existing registered files are merged in registration order (later fields replace earlier fields); missing files for a dialect are skipped. Registered files with legacy default exports still work. Nuxt layer files are merged next, from base layers toward the host application. Older `server/db/<name>.extend.<dialect>` files with default exports are also loaded before each layer's shared file, so a shared export can override them. Pass `extensionFile: dialect => 'path/to/columns.' + dialect + '.ts'` to change the per-layer file location. If `override` is a path instead of `'default'`, the host schema replaces the generated table entirely; the path is resolved from the application's root directory.
