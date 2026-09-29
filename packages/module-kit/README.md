# @frigar-nu/module-kit

A simple nuxt module to simplify development of other nuxt modules within frigear.

## Purpose

- Be a shared module kit for building nuxt modules within frigear – as generic as possible within the frigear requirements
- E.g building a 'user' or 'blog' or 'post' module for frigear-nu

## Extending a database table

Modules can register a table schema using `extendDatabaseTable` from `@frigear-nu/module-kit/utils`:

```ts
extendDatabaseTable(nuxt, {
  name: 'users',
  factory: 'defineUsersTable',
  resolver: createResolver(import.meta.url),
  schema: dialect => `./runtime/db/schema.${dialect}`,
  override: options.settings?.schemas?.users,
})
```

The schema file exports the named factory, which accepts an object of additional columns and returns a table. Other modules can register column files during setup:

```ts
registerDatabaseTableExtension(nuxt, {
  name: 'users',
  resolver: createResolver(import.meta.url),
  file: dialect => `./runtime/db/extra.${dialect}`,
})
```

Each file default-exports an object of columns. Existing registered files are merged in registration order (later fields replace earlier fields); missing files for a dialect are skipped. Files at `server/db/<name>.extend.<dialect>.ts` in Nuxt layers are merged next, from base layers toward the host application. Pass `extensionFile: dialect => 'path/to/columns.' + dialect + '.ts'` to change the per-layer file location. If `override` is a path instead of `'default'`, the host schema replaces the generated table entirely; the path is resolved from the application's root directory.
