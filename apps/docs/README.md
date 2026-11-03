# `@frigear-nu/docs`

The developer documentation site for the Frigear Nuxt workspace, built with [Nuxt](https://nuxt.com) and
[Docus](https://docus.dev).

## Features

- Supports Markdown content with frontmatter for title, description, and navigation metadata.
- Supports [MDC components](https://content.nuxt.com/docs/files/markdown#mdc-syntax) in Markdown content.

## Run locally

From the repository root, install dependencies and start the development server:

```bash
pnpm install
pnpm --filter @frigear-nu/docs dev
```

Build the documentation site with `pnpm --filter @frigear-nu/docs build`.

## Add or update a page

Content lives under `content/`, one numbered folder per header tab:

| Folder | Tab | What goes there |
| --- | --- | --- |
| `1.get-started/` | Get Started | The linear path for building an app on the published packages |
| `2.guide/` | Guide | Concepts, UX patterns, best practices and deeper topics |
| `3.modules/<category>/` | Modules | One page (or folder) per module, in its category |
| `4.examples/` | Examples | Starters, reference apps and short task examples |
| `5.contribute/` | Contribute | Working on this repository: local development, writing modules, releasing |

Numbered names set the order in navigation; the name after the number is the route. Each folder's `.navigation.yml`
sets its title and icon. When you move or rename a page, add the old URL to `redirects` in `nuxt.config.ts`: published
packages link to these URLs from npm.

The full guide is [Documentation](./content/5.contribute/6.documentation.md) (`/contribute/documentation` on the site).
