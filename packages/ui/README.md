# @frigear-nu/ui

Shared UI components, composables and helpers for Frigear Nuxt applications, built on Nuxt UI. Registers its
components globally (no prefix) and auto-imports its composables and helpers. It brings patterns, not a theme: every
card uses the same `bg-elevated/50 ring ring-default rounded-lg` surface and the host's Nuxt UI colours.

Built-in strings come from `@nuxtjs/i18n` when installed (`patterns.*`, `actions.*`; `en` and `da` included), with
English fallbacks; every one of them can be overridden by a prop.

## App shell

`AppShell` is the dashboard shell of the app areas (admin, account); an area layout wraps its pages in it:

```vue
<AppShell
  id="admin"
  :title="t('title', 'Administration')"
  home="/admin"
  :navigation="navigation"
  :nav-label="t('nav.label', 'Admin navigation')"
  :search-groups="searchGroups"
  :back-to="{ to: '/', label: t('backToSite', 'Back to the site') }"
>
  <template #sidebar-footer="{ collapsed }">
    <AccountMenu block :collapsed="collapsed" />
  </template>
  <slot />
</AppShell>
```

- `id` keys the `dashboard-sidebar-<id>` cookie (collapse, width); one per area. `home` and `backTo.to` are raw
  paths, the shell adds the locale prefix.
- `navigation` is a list of `UNavigationMenu` groups (`type: 'label'` rows head a group). The navbar shows a muted
  eyebrow, `title › active section`, never a heading: the page renders the only `<h1>` through `PageHeading`.
- `searchGroups` adds the ⌘K button and palette (without the colour-mode group); leave it out for no search.
- The body is centred at `max-w-7xl`; `wide` or `definePageMeta({ wide: true })` makes it full width.
- The document title defaults to the active section (else `title`); a page's own `useHead` wins.
- Slots: `brand`, `sidebar-top`, `sidebar-footer` (all get `{ collapsed }`), `navbar-left` (replaces the eyebrow),
  `navbar-right` (defaults to `LanguageSelect` when the app has one and more than one locale), default.
- The light app theme is utility classes on the shell (`bg-default` body, `bg-elevated/25` sidebar, a
  primary-coloured brand tile); hosts can target `[data-area=app]`.

## Page patterns

| Component | Use |
|---|---|
| `PageHeading` | Title block of an app page: breadcrumb (array) or eyebrow line (string), `#badge`, description, meta row, `#actions` |
| `PageSectionSwitcher` | Full-width button naming the current section, with a menu of all sections (mobile section navigation) |
| `PageTabs` | Tabs under a heading: links (`to`, route decides) or state (`v-model` + `value`) |
| `SectionCard` | A titled card for one section (form, key facts); `flush` for tables and lists |
| `TableCard` | The surface a `UTable` sits in (`:ui="tableUi()"`), with `#header` and `#footer` (total, pagination) |
| `RowMenu` | The `⋯` menu of a table row or heading; order Open → edits → destructive group |
| `StatCard` | A number with a label, tinted icon and hint; links to its list with `to` |
| `ListCard` | A short divided list with a "View all" link |
| `DescriptionList` | Label/value rows; empty values read "Not set"; slot per `key` |
| `PageToolbar` | Search and filters above a table, `#right` for counts |
| `FormRow` | A `UFormField` as a settings row (label and hint left, control right, stacked below `sm`) for inline forms in a `SectionCard`; parent `divide-y divide-default` |
| `FormSlideover` | Create/edit form in a slideover with Cancel + submit (`form="<formId>"`); works with `useOverlay` |
| `ConfirmDialog` / `useConfirmDialog()` | Confirmation before destructive actions |

| Composable | Use |
|---|---|
| `useAction()` | `{ busy, run(fn, { success?, error? }) }`: toasts success, toasts and swallows errors |
| `useErrorToast()` | `(e, title?) => void`: an error as a red toast |
| `useCopyToClipboard()` | `{ copy(text, message?) }` with a "Copied" toast |
| `useFormat()` | `{ date, dateTime, time, dateRange, money }` in the active locale and the app time zone (`appConfig.frigearUi.timeZone`, e.g. `Europe/Copenhagen`), so server and client render the same text |
| `useLocaleLink()` | `{ localize, strip, isActive }`: locale-prefix aware paths (identity without i18n) |
| `useNavLinks(items, { exact })` | Menu items to `UNavigationMenu` links with localised `to` and `active` |

| Helper (`@frigear-nu/ui/utils`) | Use |
|---|---|
| `errorMessage(e, fallback)`, `errorToToast(e, overrides?)` | The useful message of a `$fetch`/`createError` error |
| `formatDate`, `formatDateTime`, `formatTime`, `formatDateRange` | `Intl` date formatting (`value, locale?, options?`) |
| `statusColor(status, overrides?)` | Badge colour of a status (published/active/paid → success, pending → warning, failed → error) |
| `stripLocale(path, codes)` | A path without its `/<locale>` prefix |
| `surfaceClass`, `tableUi(overrides?)` | The card surface and a `UTable` `:ui` for `TableCard` |

Types (`DescriptionItem`, `PageTabItem`, `StatusColor`, …) are exported from `@frigear-nu/ui/types`.

## Inputs

`CurrencyInput`, `MoneyInput`, `DateInput`, `IntervalInput`, `TagInput`, `UrlInput`, `IconInput`, `SwitchToggle`,
`MarkdownTextarea`, `TranslatedInput`; `MonacoCodeEditor` only when the host installs `nuxt-monaco-editor`.

See the [documentation](../../apps/docs/content/3.modules/4.interface/1.ui.md) and the [playground](./playground).
