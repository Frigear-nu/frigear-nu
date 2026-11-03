# create-frigear-app

Create a Frigear project from one of the starters:

```bash
pnpm create frigear-app my-app
npm create frigear-app@latest my-app
```

It is the `init` command of [`@frigear-nu/cli`](../cli) under its own name, so it takes the same arguments:
`--starter <workspace|mobile|mobile-standalone>` (asked when not given), `--ref`, `--force` and `--no-install`. It copies
the starter from `Frigear-nu/frigear-nu` with [giget](https://github.com/unjs/giget), names the root package after the
folder, and runs `pnpm install` and `pnpm prepare:env`. While that repository is not public, set `GIGET_AUTH` to a
GitHub token that can read it.

Full reference: [docs.frigear.dev/contribute/tooling/cli](https://docs.frigear.dev/contribute/tooling/cli).

## Releasing

It depends on `@frigear-nu/cli` with `workspace:^`, so release the CLI first when `init` changed: the published range is
taken from the CLI's version at the time this package is packed.
