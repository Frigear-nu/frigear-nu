import type { schema } from '@nuxthub/db'
import { searchText } from '@frigear-nu/module-kit/server'

type OperationSearchSource = Pick<typeof schema.operations.$inferSelect, 'name' | 'slug'>

/** `operations.searchText`: the name in every language and the slug, folded (on create, rename and by `search:reindex`). */
export const operationSearchText = (operation: OperationSearchSource): string => searchText(operation.name, operation.slug)
