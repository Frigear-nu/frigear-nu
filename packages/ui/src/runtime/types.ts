// Shared types of the pattern components and composables (`@frigear-nu/ui/types`).
import type { NavigationMenuItem } from '@nuxt/ui'

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
