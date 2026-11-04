# create-frigear-app

Create a Frigear project from one of the starters:

```bash
pnpm create frigear-app my-app
npm create frigear-app@latest my-app
```

It has no dependencies: it runs `init` of the latest [`@frigear-nu/cli`](../cli) (`pnpm dlx @frigear-nu/cli@latest
init`, or `npx`, `yarn dlx`, `bunx`, after the package manager that started it), so it takes the same arguments:
`--platform <web|mobile|web,mobile>` or a starter name (asked when not given), `-t <giget source>`, `--ref` (default
`main`), `--force` and `--no-install`. It copies the starter from `Frigear-nu/frigear-nu` with
[giget](https://github.com/unjs/giget), names the root package after the folder, and runs `pnpm install` and
`pnpm prepare:env`. While that repository is not public, set `GIGET_AUTH` to a GitHub token that can read it.

Set `FRIGEAR_CLI` to run another CLI than `@frigear-nu/cli@latest`: a version (`@frigear-nu/cli@0.1.0`) or a packed
tarball.

Full reference: [docs.frigear.dev/contribute/tooling/cli](https://docs.frigear.dev/contribute/tooling/cli).

## Releasing

A CLI release reaches `pnpm create frigear-app` without releasing this package. Release it only when the launcher
itself changes.
