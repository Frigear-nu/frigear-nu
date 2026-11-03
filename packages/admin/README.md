# @frigear-nu/admin

Generic admin area: an `admin` layout built on the shared `AppShell` from `@frigear-nu/ui` with a grouped sidebar (the
`admin.nav` menu: Overview, Manage and Settings, see `ADMIN_NAV_GROUPS`), a ⌘K palette over the same entries, a
back-to-site link and the account menu in the sidebar footer. The navbar shows a muted area › section eyebrow, not a
title: every page renders the one `<h1>` through `PageHeading`. The area also has a guarded dashboard (the `admin.dashboard` widget areas). Other modules register their admin
pages, nav entries and widgets into it. Pages are built from the `@frigear-nu/ui` page patterns (`PageHeading`,
`SectionCard`, `TableCard`, …).

See the [documentation](../../apps/docs/content/5.modules/02.admin.md) for usage.
