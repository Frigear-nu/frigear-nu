import type { DashboardHomeTabOptions } from '../../types'

export const HOME_TAB_DEFAULTS = { dashboard: 'crew.home', path: '/crew', label: 'Home', icon: 'i-lucide-house' } as const

/** The Home tab, in the shape of `@frigear-nu/mobile`'s `MobileTabDefinition`. */
export interface HomeTab {
  id: 'home'
  to: string
  label: string
  /** Set only for the default label, so a host's own `label` is not translated away. */
  labelKey?: string
  icon: string
  sfSymbol: string
  requiresAuth: boolean
  order: number
}

export interface ResolvedHomeTab {
  dashboard: string
  path: string
  tab: HomeTab
}

/**
 * The Home tab to register, or `undefined` when there is none: without `@frigear-nu/mobile`, or with
 * `homeTab: false`. A web app places `<Dashboard>` on a page itself.
 */
export function resolveHomeTab(option: DashboardHomeTabOptions | false | undefined, { mobile }: { mobile: boolean }): ResolvedHomeTab | undefined {
  if (!mobile || option === false) return undefined
  const dashboard = option?.dashboard || HOME_TAB_DEFAULTS.dashboard
  const raw = option?.path || HOME_TAB_DEFAULTS.path
  const path = raw.startsWith('/') ? raw : `/${raw}`
  return {
    dashboard,
    path,
    tab: {
      id: 'home',
      to: path,
      label: option?.label || HOME_TAB_DEFAULTS.label,
      ...(option?.label ? {} : { labelKey: 'dashboard.home.label' }),
      icon: option?.icon || HOME_TAB_DEFAULTS.icon,
      sfSymbol: 'house',
      requiresAuth: true,
      order: 0,
    },
  }
}
