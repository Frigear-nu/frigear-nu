import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'

// The fixture's committed sqlite migrations, applied in order to an in-memory database with rows written under 0000:
// `0001_shift_handover` turns the old swap mode into `approval` (`approval` -> `lead`) and adds the new settings.
const dir = fileURLToPath(new URL('../fixtures/authenticated/server/db/migrations/sqlite/', import.meta.url))
const statements = async (file: string) => (await readFile(`${dir}${file}`, 'utf8')).split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean)

describe('0001_shift_handover', () => {
  it('maps the old swap mode to approval, and gives old rows the default coverage, handover and kind', async () => {
    const client = createClient({ url: ':memory:' })
    for (const sql of await statements('0000_init.sql')) await client.execute(sql)
    const now = Date.now()
    for (const [id, mode] of [['shs_a', 'approval'], ['shs_p', 'peer']]) {
      await client.execute({ sql: 'INSERT INTO shift_schedules (id, operationId, name, status, swapMode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id, 'op', '"x"', 'published', mode!, now, now] })
    }
    await client.execute({ sql: 'INSERT INTO shift_swaps (id, assignmentId, userId, status, openedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', args: ['shw_1', 'sha_1', 1, 'open', now, now, now] })

    for (const sql of await statements('0001_shift_handover.sql')) await client.execute(sql)

    const schedules = (await client.execute('SELECT id, coverage, handover, approval FROM shift_schedules ORDER BY id')).rows
    expect(schedules.map(row => ({ ...row }))).toEqual([
      { id: 'shs_a', coverage: 'flexible', handover: 'both', approval: 'lead' },
      { id: 'shs_p', coverage: 'flexible', handover: 'both', approval: 'peer' },
    ])
    const columns = (await client.execute('PRAGMA table_info(shift_schedules)')).rows.map(row => row.name)
    expect(columns).not.toContain('swapMode')
    const [swap] = (await client.execute('SELECT kind, wantedAssignmentId FROM shift_swaps')).rows
    expect({ ...swap }).toEqual({ kind: 'release', wantedAssignmentId: null })
    client.close()
  })
})
