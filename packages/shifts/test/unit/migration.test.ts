import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'

// The fixture's committed sqlite migration, applied to an in-memory database the way NuxtHub applies it.
const dir = fileURLToPath(new URL('../fixtures/authenticated/server/db/migrations/sqlite/', import.meta.url))
const statements = async (file: string) => (await readFile(`${dir}${file}`, 'utf8')).split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean)

describe('0000_init', () => {
  it('gives new schedules and swaps their defaults and keeps one earned perk per perk and assignment', async () => {
    const client = createClient({ url: ':memory:' })
    for (const sql of await statements('0000_init.sql')) await client.execute(sql)
    const now = Date.now()

    await client.execute({ sql: 'INSERT INTO shift_schedules (id, operationId, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', args: ['shs_1', 'op', '"x"', now, now] })
    const [schedule] = (await client.execute('SELECT status, coverage, handover, approval, checkIn, autoNoShow, autoNoShowMinutes FROM shift_schedules')).rows
    expect({ ...schedule }).toEqual({ status: 'draft', coverage: 'flexible', handover: 'both', approval: 'peer', checkIn: null, autoNoShow: 0, autoNoShowMinutes: 30 })

    await client.execute({ sql: 'INSERT INTO shift_swaps (id, assignmentId, userId, status, openedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', args: ['shw_1', 'sha_1', 1, 'open', now, now, now] })
    const [swap] = (await client.execute('SELECT kind, wantedAssignmentId FROM shift_swaps')).rows
    expect({ ...swap }).toEqual({ kind: 'release', wantedAssignmentId: null })

    const tables = (await client.execute('SELECT name FROM sqlite_master WHERE type = \'table\'')).rows.map(row => row.name)
    expect(tables).toEqual(expect.arrayContaining(['shift_earned_perks', 'shift_stations', 'shift_digest_items']))
    for (const gone of ['shift_perk_grants', 'shift_perk_redemptions', 'push_channel_preferences', 'maps']) expect(tables).not.toContain(gone)

    const earn = (id: string) => client.execute({ sql: 'INSERT INTO shift_earned_perks (id, perkId, assignmentId, userId, voucherType, quantity, earnedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id, 'spk_1', 'sha_1', 1, 'beer', 2, now] })
    await earn('spg_1')
    await expect(earn('spg_2')).rejects.toThrow()
    client.close()
  })
})
