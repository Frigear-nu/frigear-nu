# @frigear-nu/docs

The project documentation site, built with [Nuxt 4.5](https://nuxt.com) and [Docus](https://docus.dev).

## Features

- Supports Markdown content with frontmatter for title, description, and navigation metadata.
- Supports [Comark](https://comark.dev/getting-started/introduction) / [MDC](https://github.com/nuxt-content/mdc) 

## Run locally

Run commands from the repository root:

```bash
pnpm --filter @frigear-nu/docs dev
pnpm --filter @frigear-nu/docs build
```

## Add or update a page

Pages are Markdown files grouped by topic under `content/`, following the existing `content/1.getting-started/` and
`content/3.xxx/` sections.

1. Choose the relevant topic folder under `content/`, or create a new numbered folder for a new topic.
2. Add a numbered Markdown file, for example `content/1.getting-started/3.adding-documentation.md`. Numbered names
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

4. Write the page in Markdown, keeping it focused on Scrape Admin apps, packages, deployment, or usage.
5. From the repository root, run the docs app and verify the page and its navigation:

   ```bash
   pnpm --filter @frigear-nu/docs dev
   ```

For a new section, add a `.navigation.yml` file in its folder to set the section title or icon.
