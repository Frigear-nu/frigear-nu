# @frigear-nu/cli

Create Frigear projects from the starters, add apps and modules to a pnpm workspace, and install Frigear modules in a
Nuxt app.

```bash
pnpx @frigear-nu/cli --help
```

| Command | What it does |
| --- | --- |
| `init [dir] --starter <workspace\|mobile\|mobile-standalone>` | New project from a starter, then `pnpm install` and `pnpm prepare:env`. |
| `app:create <name> --template <web\|web-standalone\|mobile>` | Adds a starter's app to `apps/<name>`. |
| `module:create <name> [--scope @acme]` | Scaffolds a Nuxt module in `packages/<name>`. |
| `add <module...> [--app <app>]` | `pnpm add` in the app and adds the modules to its `nuxt.config`. |

Starters are downloaded from `Frigear-nu/frigear-nu` with [giget](https://github.com/unjs/giget) (`--ref` picks a branch
or tag). While that repository is not public, set `GIGET_AUTH` to a GitHub token that can read it.

`pnpm create frigear-app` ([create-frigear-app](../create-frigear-app)) is `init` under its own name.

Full reference: [docs.frigear.dev/contribute/tooling/cli](https://docs.frigear.dev/contribute/tooling/cli).

## In this repository

`pnpm cli <command>` from the root runs `bin/cli.mjs`, which loads `src/cli.ts` through
[jiti](https://github.com/unjs/jiti), so there is no build step. The published package is built with unbuild into
`dist/` (`publishConfig.bin`).
