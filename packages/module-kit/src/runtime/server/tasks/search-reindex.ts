import { defineTask } from 'nitropack/runtime'
import { db } from '@nuxthub/db'
import { indexes } from '#search-indexes'
import { reindexSearchIndex } from '../search-index'
import type { SearchIndexDatabase, SearchReindexResult } from '../search-index'

// Rewrites every search column registered with `registerSearchIndex` through the app's own folding. Idempotent.
export default defineTask({
  meta: {
    name: 'search:reindex',
    description: 'Recompute the normalised search columns of every registered table.',
  },
  async run() {
    const results: SearchReindexResult[] = []
    for (const { name, index } of indexes) {
      const result = await reindexSearchIndex(db as unknown as SearchIndexDatabase, index)
      console.info(`[search:reindex] ${name} (${result.table}): scanned ${result.scanned}, updated ${result.updated}`)
      results.push(result)
    }
    return { result: results }
  },
})
