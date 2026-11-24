# AGENTS.md: apps/docs

- This app documents the whole repository, for developers who build on the `@frigear-nu` ecosystem. It is not the
  documentation for the product in `apps/website`; that belongs in `apps/website` itself.

- Uses the Nuxt 4 directory structure: source lives under `apps/docs/app/`
  (`app/components`, `app/composables`, `app/pages`, `app/layouts`,
  `app/middleware`, `app/utils`). Server code (event handlers, server-only utils) lives in `apps/docs/server/`. Don't
  recreate the old Nuxt 3 top-level `components/`, `pages/`, etc. folders outside `app/`.
- Is built on [docus.dev](https://docus.dev/) — check its docs for guidance on writing content, configuring the site, and
  customizing the theme and how to structure content.
- the `apps/docs/README.md` is the source of truth for how to run and build the docs site.
