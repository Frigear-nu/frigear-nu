import { schema } from '@nuxthub/db'
import { defineSearchIndex } from '@frigear-nu/module-kit/server'
import { withUserSearchText } from './utils/user-search'

// `users.searchText` for the `search:reindex` task, computed like every name write (`withUserSearchText`).
export default defineSearchIndex({
  table: schema.users,
  columns: user => ({ searchText: withUserSearchText({ name: user.name ?? '' }).searchText ?? '' }),
})
