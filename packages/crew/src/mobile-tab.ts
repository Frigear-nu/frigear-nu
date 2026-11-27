import type { MobileTabDefinition } from '@frigear-nu/mobile/utils'

/**
 * The "Crew" tab of a `@frigear-nu/mobile` app: the crew home when it is in the signed-in hub of `@frigear-nu/dashboard`
 * (`/dashboard/crew`, with its tabs: Overview, My crew and what other modules add, such as My shifts and Swaps), else
 * My crew (the status page). None without either.
 */
export function crewMobileTab(pages: { home?: string, status?: string, inDashboard: boolean }): MobileTabDefinition | undefined {
  const to = pages.inDashboard && pages.home ? pages.home : pages.status
  if (!to) return undefined
  return {
    id: 'crew',
    to,
    label: 'Crew',
    labelKey: 'crew.mobile.tab',
    icon: 'i-lucide-hand-heart',
    sfSymbol: 'person.3',
    sfSymbolActive: 'person.3.fill',
    requiresAuth: true,
  }
}
