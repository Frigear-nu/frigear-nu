import { z } from 'zod'

// Registered with `addUserPreferences` only when `@frigear-nu/preferences` is installed. This is what
// `definePreferences({...})` returns (it is the identity function); written without it so the file does not import
// `@frigear-nu/preferences`, an optional peer of this package.
//
// Preferences ride in the sealed session cookie (the session user carries them), and a cookie holds about 4 KB in
// all. So the layout is bounded: at most 20 dashboards, 50 ids per list, ids of at most 100 characters and at most
// 1 KB of item settings per dashboard (as JSON).

export const DASHBOARD_LIMITS = {
  dashboards: 20,
  idsPerList: 50,
  idLength: 100,
  settingsBytes: 1024,
} as const

const id = z.string().min(1).max(DASHBOARD_LIMITS.idLength)
const ids = z.array(id).max(DASHBOARD_LIMITS.idsPerList)

/** One user's layout of one dashboard. */
export const dashboardLayoutSchema = z.object({
  order: ids,
  hidden: ids,
  collapsed: ids,
  settings: z.record(id, z.record(z.string(), z.unknown()))
    .refine(value => JSON.stringify(value).length <= DASHBOARD_LIMITS.settingsBytes, {
      message: `Item settings take at most ${DASHBOARD_LIMITS.settingsBytes} bytes per dashboard.`,
    })
    .optional(),
})

/** Every dashboard's layout of one user, by dashboard name (`crew.home`). */
export const dashboardLayoutsSchema = z.record(id, dashboardLayoutSchema)
  .refine(value => Object.keys(value).length <= DASHBOARD_LIMITS.dashboards, {
    message: `At most ${DASHBOARD_LIMITS.dashboards} dashboard layouts.`,
  })

export default {
  dashboardLayouts: dashboardLayoutsSchema,
}
