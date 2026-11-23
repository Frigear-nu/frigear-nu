import { z } from 'zod'

// Registered with `addUserPreferences` only when `@frigear-nu/preferences` is installed. This is what
// `definePreferences({...})` returns (it is the identity function); written without it so the file does not import
// `@frigear-nu/preferences`, an optional peer of this package.
//
// The preference is `managed`: it stays out of the session cookie (Preferences' session filter) and `PATCH
// /api/preferences` refuses it, so it is read and written only through `GET`/`PATCH /api/dashboard/me/layouts`. The
// layout still has bounds, as one JSON column holds it: at most 20 dashboards, 200 ids per list (a move stores only
// the moved ids), ids of at most 100 characters and at most 1 KB of item settings per dashboard (as UTF-8 encoded JSON).

/** The preference key the layouts are stored under. */
export const DASHBOARD_LAYOUTS_KEY = 'dashboardLayouts'

export const DASHBOARD_LIMITS = {
  dashboards: 20,
  idsPerList: 200,
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
    .refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= DASHBOARD_LIMITS.settingsBytes, {
      message: `Item settings take at most ${DASHBOARD_LIMITS.settingsBytes} bytes per dashboard.`,
    })
    .optional(),
})

/** Every dashboard's layout of one user, by dashboard name (`crew.home`). */
export const dashboardLayoutsSchema = z.record(id, dashboardLayoutSchema)
  .refine(value => Object.keys(value).length <= DASHBOARD_LIMITS.dashboards, {
    message: `At most ${DASHBOARD_LIMITS.dashboards} dashboard layouts.`,
  })

/** A dashboard name: the key of a layout. */
export const dashboardNameSchema = id

// The key is `DASHBOARD_LAYOUTS_KEY`, written out so the generated types know it.
export default {
  dashboardLayouts: { schema: dashboardLayoutsSchema, managed: true as const },
}
