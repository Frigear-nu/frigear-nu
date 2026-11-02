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

Pages are Markdown files grouped by topic under `content/`. Follow the numbered folder and filename convention already
used in the app so pages appear in the intended navigation order.

1. Choose the relevant topic folder under `content/`, or create a new numbered folder for a new topic.
2. Add a numbered Markdown file, for example `content/1.getting-started/8.adding-documentation.md`. Numbered names
   control the order in navigation; the filename after the number becomes the page route.
3. Add frontmatter with at least a `title` and `description`. Optional `navigation` metadata can set the page icon or
   display title:

   ```yaml
   ---
   title: Adding Documentation
   description: Add a guide to the Frigear docs site.
   navigation:
     icon: i-lucide-file-plus
   ---
   ```

4. Write focused Markdown about the Frigear workspace, its applications, layers, modules, or packages. Check code and
   package READMEs before documenting behavior.
5. From the repository root, run the docs app and verify the page and its navigation:

   ```bash
   pnpm --filter @frigear-nu/docs dev
   ```

For a new section, add a `.navigation.yml` file in its folder to set the section title or icon.

## Documentation conventions

- **Ordering.** Docus sorts navigation by file name as a string, so use unique two-digit prefixes (`01.`, `02.`, ...).
  Module pages in `content/4.modules/` are numbered alphabetically by title; insert a new module by renumbering.
- **Titles.** Use the plain name (`Auth`, `Cookie Consent`), never a `Module` suffix.
- **Module page layout**, in this order, skipping sections that do not apply: intro (no H1, no package-name heading),
  requirements note (hard and optional dependencies from `moduleDependencies`), `## Quick setup`, `## Options` (table:
  option, type, default, purpose), then `## Server`, `## App`, `## Hooks`, `## Routes`, `## Database`,
  `## Translations`.
- **Code and reference.** Signatures, types and payloads go in fenced `ts` blocks. Hooks, routes, options and environment
  variables go in tables. Do not describe them in running prose.
- **Accuracy.** Check defaults, routes and hooks against the source before documenting them.
- **Nuxt 4.** Every module targets Nuxt 4. Write Quick setup and other examples as Nuxt 4 code (`app/` directory,
  `defineNuxtConfig`), never Nuxt 3 or Nuxt 2 patterns.
- **Links.** Link to pages by slug (`/modules/auth`), never by numbered file name.
