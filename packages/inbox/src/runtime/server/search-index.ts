import { schema } from '@nuxthub/db'
import { defineSearchIndex } from '@frigear-nu/module-kit/server'
import { inboxThreadSearchText } from './utils/inbox-search'

// `inbox_threads.searchText` for the `search:reindex` task, computed like on write (empty for anonymised threads).
export default defineSearchIndex({
  table: schema.inboxThreads,
  columns: thread => ({ searchText: inboxThreadSearchText(thread) }),
})
