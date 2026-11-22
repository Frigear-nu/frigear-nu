import { describe, it } from 'vitest'
import { expectSchemaParity } from '@frigear-nu/module-kit/testing'
import * as schemaSqlite from '../src/runtime/server/db/schema.sqlite'
import * as schemaPostgresql from '../src/runtime/server/db/schema.postgresql'
import * as teamMembersSqlite from '../src/runtime/server/db/team-members.sqlite'
import * as teamMembersPostgresql from '../src/runtime/server/db/team-members.postgresql'

// The postgresql schema must stay in sync with the sqlite one: same tables, columns, defaults, indexes and keys. That holds
// for the module's own tables and for the extension file, which adds columns to `team_members`.
describe('schema dialects', () => {
  it('schema.postgresql matches schema.sqlite', () => {
    expectSchemaParity(schemaSqlite, schemaPostgresql)
  })

  it('team-members.postgresql matches team-members.sqlite', () => {
    expectSchemaParity(teamMembersSqlite, teamMembersPostgresql)
  })
})
