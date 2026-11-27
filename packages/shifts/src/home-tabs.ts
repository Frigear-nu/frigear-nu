import type { Nuxt } from '@nuxt/schema'
import type { TabDefinition } from '@frigear-nu/widget/utils'

type WidgetUtils = { extendTabs: (nuxt: Nuxt, area: string, tabs: TabDefinition | TabDefinition[]) => void }

/**
 * Adds My shifts and Swaps to the crew home's tabs (`crew.dashboard`). Whether `@frigear-nu/widget` is installed yet is
 * not asked: when it comes in as another module's dependency (Crew and Dashboard need it), it is installed after this
 * module, as in an app that lists only the feature modules (a mobile app). A tab for an area nobody renders is harmless.
 * Without the package nothing is added. Resolves whether the tabs were added.
 */
export async function extendCrewHomeTabs(
  nuxt: Nuxt,
  tabs: TabDefinition[],
  load: () => Promise<WidgetUtils> = () => import('@frigear-nu/widget/utils'),
): Promise<boolean> {
  if (!tabs.length) return false
  const widget = await load().catch(() => undefined)
  if (!widget) return false
  widget.extendTabs(nuxt, 'crew.dashboard', tabs)
  return true
}
