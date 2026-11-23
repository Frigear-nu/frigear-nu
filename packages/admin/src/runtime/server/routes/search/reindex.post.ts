import { runTask } from 'nitropack/runtime'
import type { SearchReindexResult } from '@frigear-nu/module-kit/server'
import { searchAccess } from '../../../access'
import type { AdminSearchReindexDto } from '../../../../types'

// Runs module-kit's `search:reindex` task (the same code as `nuxt task run search:reindex` in development) and answers
// the rows read and rewritten per table. Idempotent: a second run rewrites nothing. Nitro runs one instance of a task at
// a time, so a second request while one runs waits for the same result.
export default defineEventHandler(async (event): Promise<AdminSearchReindexDto> => {
  await authorize(event, searchAccess.permissions.reindex)
  const { result } = await runTask<SearchReindexResult[]>('search:reindex')
  return {
    tables: (result ?? []).map(({ table, scanned, updated }) => ({ table, scanned, updated })),
  }
})
