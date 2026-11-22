import { schema } from '@nuxthub/db'
import { defineSearchIndex } from '@frigear-nu/module-kit/server'
import { teamSearchText } from './utils/teams-search'

// `teams.searchText` for the `search:reindex` task, computed like on create and rename.
export default defineSearchIndex({
  table: schema.teams,
  columns: team => ({ searchText: teamSearchText(team.name) }),
})
