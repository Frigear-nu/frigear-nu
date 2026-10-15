import { describe, it } from 'vitest'
import { expectSchemaParity } from '@frigear-nu/module-kit/testing'
import * as schemaSqlite from '../src/runtime/db/schema.sqlite'
import * as schemaPostgresql from '../src/runtime/db/schema.postgresql'
import * as emailChangesSqlite from '../src/runtime/db/email-changes.sqlite'
import * as emailChangesPostgresql from '../src/runtime/db/email-changes.postgresql'

// The postgresql schema must stay in sync with the sqlite one: same tables, columns, defaults, indexes and keys.
describe('schema dialects', () => {
  it('schema.postgresql matches schema.sqlite', () => {
    expectSchemaParity(schemaSqlite, schemaPostgresql)
  })
  it('email-changes.postgresql matches email-changes.sqlite', () => {
    expectSchemaParity(emailChangesSqlite, emailChangesPostgresql)
  })
})
