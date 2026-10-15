# @frigear-nu/module-kit

The shared toolkit behind the Frigear Nuxt modules: page, URL, translation, menu and registry helpers, plus database
helpers that let one module own a Drizzle table while others extend it with columns.

## Install

```bash
pnpm add @frigear-nu/module-kit
```

A module that uses it declares it in `moduleDependencies` (`'@frigear-nu/module-kit': { version: '>=0.0.1' }`), which
installs it in the host app and provides the `useModuleT` auto-import. Hosts do not add it to `modules` themselves.
The database helpers also need `@nuxthub/core` and the `drizzle-orm` / `drizzle-kit` peer dependencies.

```ts
import { registerModule, registerLocales, registerDatabaseTable } from '@frigear-nu/module-kit/utils'
```

## Documentation

- [Module Kit reference](https://docs.frigear.dev/modules/module-kit): every helper, the database registration rules and
  the migration workflow.
- [Writing a module](https://docs.frigear.dev/getting-started/writing-a-module): from `pnpm cli module:create` to a
  released module.
