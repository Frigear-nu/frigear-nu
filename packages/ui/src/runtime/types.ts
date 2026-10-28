// Shared types of the pattern components and composables (`@frigear-nu/ui/types`).
import type { CommandPaletteGroup, NavigationMenuItem } from '@nuxt/ui'

/** A row of `DescriptionList`. Without `value` the slot named after `key` (or `label`) renders it. */
export interface DescriptionItem {
  key?: string
  label: string
  value?: string | number | null
}

/** An item of `PageTabs`: a link (`to`) in link mode, or a `value` in state mode (`v-model`). */
export type PageTabItem = NavigationMenuItem & { value?: string }

/** The colours `statusColor` maps a status to (a subset of Nuxt UI's badge colours). */
export type StatusColor = 'success' | 'warning' | 'error' | 'neutral' | 'info' | 'primary'

/** Anything the date helpers accept: a `Date`, an ISO string or a timestamp. */
export type DateValue = string | number | Date

/** The shape `useNavLinks` reads: `@frigear-nu/menu`'s `MenuItem` fits, as does any object with these fields. */
export interface NavLinkSource {
  id?: string
  label: string
  icon?: string
  to?: string
  external?: boolean
  badge?: string | number
}

export interface NavLinksOptions {
  /** Targets that are only active on an exact match (e.g. a dashboard at the area's base path). */
  exact?: string[]
}

export interface ActionOptions {
  /** Toast title shown once the action succeeded; no toast without it. */
  success?: string
  /** Toast title shown when the action failed; defaults to "Something went wrong.". */
  error?: string
}

/** The sidebar footer link of `AppShell` (e.g. "Back to the site"). `to` is a raw path; the shell localises it. */
export interface AppShellBackTo {
  to: string
  label: string
  /** Defaults to `i-lucide-arrow-left`. */
  icon?: string
}

/** Props of `AppShell`, the dashboard shell of the app areas (admin, account). */
export interface AppShellProps {
  /** Unique per area: the cookie keys `dashboard-sidebar-<id>` (collapse, width) and the panel id `<id>-main`. */
  id: string
  /** Brand label in the sidebar, first part of the navbar eyebrow and the default document title. */
  title: string
  /** Raw path the brand links to; the shell localises it. */
  home: string
  /** Icon of the brand tile. Defaults to `i-lucide-layout-dashboard`. */
  icon?: string
  /** Navigation groups, one `UNavigationMenu` list each; `type: 'label'` rows head a group. */
  navigation: NavigationMenuItem[][]
  /** `aria-label` of the navigation (e.g. "Admin navigation"). */
  navLabel: string
  /** Groups of the ⌘K palette. Without them there is no search button and no palette. */
  searchGroups?: CommandPaletteGroup[]
  /** Label of the search button. */
  searchLabel?: string
  /** A link in the sidebar footer, above `#sidebar-footer`. */
  backTo?: AppShellBackTo
  /** Full-width body instead of `max-w-7xl`; pages can also ask with `definePageMeta({ wide: true })`. */
  wide?: boolean
}
