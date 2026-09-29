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

The schema file exports the named factory, which accepts an object of additional columns and returns a table. The host application can add columns by default-exporting them from `server/db/<name>.extend.<dialect>.ts`. Pass `extensionFile: dialect => 'path/to/columns.' + dialect + '.ts'` to use another file relative to the application's root. If `override` is a path instead of `'default'`, the host schema replaces the generated table entirely; the path is also resolved from the application's root directory.
