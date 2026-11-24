import type { DashboardSettings } from '../../types'

export const HUB_DEFAULTS = { path: '/dashboard', dashboard: 'home' } as const

export interface ResolvedHub {
  /** The hub page's path, also the base of the `dashboard` layout's area. */
  path: string
  /** The dashboard the hub page renders. */
  dashboard: string
}

/**
 * The signed-in hub, or `undefined` when there is none: `settings.pages.home: false`, or no `@frigear-nu/auth` (a hub
 * for signed-in users needs users).
 */
export function resolveHub(settings: DashboardSettings | undefined, { auth }: { auth: boolean }): ResolvedHub | undefined {
  const option = settings?.pages?.home ?? true
  if (option === false || !auth) return undefined
  const raw = typeof option === 'string' && option ? option : HUB_DEFAULTS.path
  const path = raw.startsWith('/') ? raw : `/${raw}`
  return { path, dashboard: settings?.home?.dashboard || HUB_DEFAULTS.dashboard }
}
