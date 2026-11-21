import { z } from 'zod'

// Registered with `addUserPreferences` only when `@frigear-nu/preferences` is installed. This is what
// `definePreferences({...})` returns (it is the identity function); written without it so the file does not import
// `@frigear-nu/preferences`, an optional peer of this package.

const ids = z.array(z.string().max(200)).max(200)

/** One user's layout of one dashboard. */
export const dashboardLayoutSchema = z.object({
  order: ids,
  hidden: ids,
  collapsed: ids,
  settings: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
})

export default {
  /** Each user's layout of every dashboard, by dashboard name (`crew.home`). */
  dashboardLayouts: z.record(z.string().max(200), dashboardLayoutSchema),
}
