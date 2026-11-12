import { describe, it } from 'vitest'
import { expectSchemaParity } from '@frigear-nu/module-kit/testing'
import * as schemaSqlite from '../src/runtime/server/db/schema.sqlite'
import * as schemaPostgresql from '../src/runtime/server/db/schema.postgresql'
import * as usersSqlite from '../src/runtime/server/db/users.sqlite'
import * as usersPostgresql from '../src/runtime/server/db/users.postgresql'

// The postgresql schema must stay in sync with the sqlite one: same tables, columns, defaults, indexes and keys.
describe('schema dialects', () => {
  it('schema.postgresql matches schema.sqlite', () => {
    expectSchemaParity(schemaSqlite, schemaPostgresql)
  })

  it('users.postgresql matches users.sqlite', () => {
    expectSchemaParity(usersSqlite, usersPostgresql)
  })
})
