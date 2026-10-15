# @frigear-nu/admin

Generic admin area: an `admin` layout with a grouped sidebar (the `admin.nav` menu: Overview, Manage and Settings, see
`ADMIN_NAV_GROUPS`) and a guarded dashboard (the `admin.dashboard` widget areas). Other modules register their admin
pages, nav entries and widgets into it. Pages are built from the `@frigear-nu/ui` page patterns (`PageHeading`,
`SectionCard`, `TableCard`, …); the `Admin*` components are deprecated aliases over them.

See the [documentation](../../apps/docs/content/4.modules/02.admin.md) for usage.
