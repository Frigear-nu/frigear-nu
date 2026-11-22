import type { schema } from '@nuxthub/db'
import { searchText } from '@frigear-nu/module-kit/server'

/** `teams.searchText`: the name in every language, folded (on create, rename and by `search:reindex`). */
export const teamSearchText = (name: typeof schema.teams.$inferSelect['name']): string => searchText(name)
