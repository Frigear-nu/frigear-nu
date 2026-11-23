// Typed paths of the admin module's HTTP routes, for app code, tests and docs. Published as `@frigear-nu/admin/api`.
import type { AdminSearchReindexDto } from '../../types'

export type { AdminSearchReindexDto }

/** The admin module's own API. */
export const adminApi = {
  search: {
    /**
     * `POST`: runs the `search:reindex` task and answers `AdminSearchReindexDto` (rows read and rewritten per table).
     * `search:reindex` (session only, admin). Only when a module registered a search index.
     */
    reindex: '/api/admin/search/reindex',
  },
} as const
