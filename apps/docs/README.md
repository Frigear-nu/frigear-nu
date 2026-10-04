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
2. Add a numbered Markdown file, for example `content/1.getting-started/4.adding-documentation.md`. Numbered names
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
