// Build-time utils, safe to import from another module's `setup()` (no `@nuxt/kit` import).
import type { Nuxt } from '@nuxt/schema'
import type { MobileTabDefinition } from '../../types'

export type { MobileTabDefinition, MobilePageMeta, MobileTab } from '../../types'
export { normalizeTabs, findActiveTab, matchesPath } from '../shared/tabs'

type MobileExtensions = { mobile?: { _tabs?: MobileTabDefinition[] } }

/** Types a tab definition (for tabs kept in their own file). */
export const defineMobileTab = (tab: MobileTabDefinition): MobileTabDefinition => tab

/**
 * Adds tabs from a module's `setup()`. They follow the app's own `mobile.tabs` in registration order unless they set
 * `order`; a tab with an id that exists already replaces it field by field, so a host can relabel a module's tab.
 *
 * ```ts
 * import { extendMobileTabs } from '@frigear-nu/mobile/utils'
 *
 * extendMobileTabs(nuxt, { id: 'events', to: '/events', label: 'Events', icon: 'i-lucide-calendar', sfSymbol: 'calendar' })
 * ```
 */
export function extendMobileTabs(nuxt: Nuxt, tabs: MobileTabDefinition | MobileTabDefinition[]): void {
  const options = nuxt.options as unknown as MobileExtensions
  options.mobile ||= {}
  const list = options.mobile._tabs ||= []
  list.push(...[tabs].flat())
}
