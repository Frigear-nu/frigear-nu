# @frigear-nu/cli

Create Frigear projects from the starters, add apps and modules to a pnpm workspace, and install Frigear modules in a
Nuxt app.

```bash
pnpx @frigear-nu/cli --help
```

| Command | What it does |
| --- | --- |
| `init [dir] --platform <web\|mobile\|desktop\|web,mobile\|web,mobile,desktop>` | New project from a starter (or `-t <giget source>`), then `pnpm install` and `pnpm prepare:env`. |
| `platform add <platform> [name] [-t <template>] [--apps-dir auto\|<dir>]` | Adds an app of a platform (web, mobile, desktop or a project's own) and its root scripts; from the root or the apps folder. |
| `platform init <ios\|android\|apple-watch\|tauri\|...> [--app <name>]` | Sets up a native target in an app through its own tooling. |
| `platform list` | Platforms, templates, targets and the workspace's apps. |
| `app:create <name> --template <web\|web-standalone\|mobile\|desktop>` | `platform add <template> <name>`. |
| `module:create <name> [--scope @acme]` | Scaffolds a Nuxt module in `packages/<name>`. |
| `add <module...> [--app <app>]` | `pnpm add` in the app and adds the modules to its `nuxt.config`. |
| `package:rename <package> <new-name> [--dir]` | Renames a workspace package in manifests, `pnpm-workspace.yaml`, imports and config. |
| `module:folder <module> [--runtime]` | Turns `modules/foo.ts` into `modules/foo/index.ts`. |
| `module:move <module> <destination> [--name <name>]` | Moves a local module or package folder and fixes relative paths. |

`addPlatform`, `initPlatform` and `definePlatform` are exported for use from code.

The three refactoring commands take `--dry-run` to print the changes without writing them.

Starters are downloaded from `Frigear-nu/frigear-nu` with [giget](https://github.com/unjs/giget) (`--ref` picks a branch
or tag). While that repository is not public, set `GIGET_AUTH` to a GitHub token that can read it.

`pnpm create frigear-app` ([create-frigear-app](../create-frigear-app)) runs `init` of the latest CLI.

Full reference: [docs.frigear.dev/contribute/tooling/cli](https://docs.frigear.dev/contribute/tooling/cli).

## In this repository

`pnpm cli <command>` from the root runs `bin/cli.mjs`, which loads `src/cli.ts` through
[jiti](https://github.com/unjs/jiti), so there is no build step. The published package is built with unbuild into
`dist/` (`publishConfig.bin`).
