import { schema } from '@nuxthub/db'
import { defineSearchIndex } from '@frigear-nu/module-kit/server'
import { operationSearchText } from './utils/operations-search'

// `operations.searchText` for the `search:reindex` task, computed like on create and rename.
export default defineSearchIndex({
  table: schema.operations,
  columns: operation => ({ searchText: operationSearchText(operation) }),
})
