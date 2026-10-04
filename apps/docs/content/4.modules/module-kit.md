---
title: Module Kit
description: Helpers for building Frigear Nuxt modules and extending database schemas.
---


A shared toolkit for building Nuxt modules in the Frigear workspace. It currently provides helpers for composing and
extending database schemas while keeping table-specific behavior in the modules that own those tables.

## Purpose

- Share common module-development utilities across Frigear packages.
- Let one module add columns to a table owned by another module without replacing its schema.

The package is consumed by workspace modules such as [`@frigear-nu/users`](/packages/users).

## Extending a database table

The table-owning module registers its schema with `extendDatabaseTable` from
`@frigear-nu/module-kit/utils`:

```ts
extendDatabaseTable(nuxt, {
  name: 'users',
  factory: 'defineUsersTable',
  resolver: createResolver(import.meta.url),
  schema: dialect => `./runtime/db/schema.${dialect}`,
  override: options.settings?.schemas?.users,
})
```

The schema file exports the named factory, which accepts an object of additional columns and returns a table. The factory must spread the received `extra` columns *last* in the object passed to the table builder (after every one of its own fields, including timestamps), so extended columns always end up last in the generated migration, matching the order they were registered in. Other modules can register column files during setup:

```ts
registerDatabaseTableExtension(nuxt, {
  name: 'users',
  resolver: createResolver(import.meta.url),
  file: dialect => `./runtime/db/extra.${dialect}`,
})
```

Each extension file exports column objects named for their tables. For example, a Nuxt layer can extend multiple tables
in `server/db/extend.sqlite.ts`:

```ts
export const users = defineExtendedColumns({ locale: text().default('da') })
export const posts = defineExtendedColumns({ summary: text() })
```

Only the export matching the table being built is used. Existing registered files are merged in registration order (later fields replace earlier fields); missing files for a dialect are skipped. Registered files with legacy default exports still work. Nuxt layer files are merged next, from base layers toward the host application. Older `server/db/<name>.extend.<dialect>` files with default exports are also loaded before each layer's shared file, so a shared export can override them. Pass `extensionFile: dialect => 'path/to/columns.' + dialect + '.ts'` to change the per-layer file location. If `override` is a path instead of `'default'`, the host schema replaces the generated table entirely; the path is resolved from the application's root directory.
