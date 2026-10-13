# @frigear-nu/cli

This is a package for executing certain commands within this stack/repository.
**It is not intended to be used outside of this repo.**

It is private and is not built or published: `bin/cli.mjs` loads `src/cli.ts` at runtime through
[jiti](https://github.com/unjs/jiti).

To see available commands, run from the repository root:

```bash
pnpm cli --help
```

## Commands

### `module:create`

Scaffolds a new module under `packages/<name>` from a template and renames it to `@frigear-nu/<name>`.

```bash
pnpm cli module:create <name> [--template <template>] [--cwd <path>]
```

| Argument     | Description                                                                           |
| ------------ | ------------------------------------------------------------------------------------- |
| `<name>`     | Name of the new module, e.g. `my-module` (kebab-cased for the directory and package). |
| `--template` | [giget](https://github.com/unjs/giget) template. Defaults to `gh:nuxt/starter#module`. |
| `--cwd`      | Repository root to create the module in. Defaults to the directory `pnpm` was run in.  |

The command fails if `packages/<name>` already contains a package.
