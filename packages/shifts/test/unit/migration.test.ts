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

describe('0006_shifts_checkin', () => {
  it('applies on top of the earlier migrations: check-in off, auto no-show off, perks become grants', async () => {
    const client = createClient({ url: ':memory:' })
    for (const file of ['0000_init.sql', '0001_shift_handover.sql', '0002_shifts_extras.sql', '0003_shifts_maps.sql', '0004_shifts_push.sql', '0005_shifts_venue_layout.sql']) {
      for (const sql of await statements(file)) await client.execute(sql)
    }
    const now = Date.now()
    await client.execute({ sql: 'INSERT INTO shift_schedules (id, operationId, name, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)', args: ['shs_1', 'op', '"x"', 'published', now, now] })
    for (const sql of await statements('0006_shifts_checkin.sql')) await client.execute(sql)
    const [schedule] = (await client.execute('SELECT checkIn, autoNoShow, autoNoShowMinutes FROM shift_schedules')).rows
    expect({ ...schedule }).toEqual({ checkIn: null, autoNoShow: 0, autoNoShowMinutes: 30 })
    const tables = (await client.execute('SELECT name FROM sqlite_master WHERE type = \'table\'')).rows.map(row => row.name)
    expect(tables).toEqual(expect.arrayContaining(['shift_perk_grants', 'shift_stations', 'shift_digest_items']))
    expect(tables).not.toContain('shift_perk_redemptions')
    // One grant per perk and assignment.
    const grant = (id: string) => client.execute({ sql: 'INSERT INTO shift_perk_grants (id, perkId, assignmentId, userId, voucherType, quantity, earnedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id, 'spk_1', 'sha_1', 1, 'beer', 2, now] })
    await grant('spg_1')
    await expect(grant('spg_2')).rejects.toThrow()
    client.close()
  })
})

describe('0009_shifts_earned_perks', () => {
  it('renames the perk grants to earned perks and keeps their rows and their uniqueness', async () => {
    const client = createClient({ url: ':memory:' })
    for (const file of ['0000_init.sql', '0001_shift_handover.sql', '0002_shifts_extras.sql', '0003_shifts_maps.sql', '0004_shifts_push.sql', '0005_shifts_venue_layout.sql', '0006_shifts_checkin.sql', '0007_shifts_push_provider.sql', '0008_notify_choices_in_preferences.sql']) {
      for (const sql of await statements(file)) await client.execute(sql)
    }
    const now = Date.now()
    await client.execute({ sql: 'INSERT INTO shift_perk_grants (id, perkId, assignmentId, userId, voucherType, quantity, earnedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', args: ['spg_1', 'spk_1', 'sha_1', 1, 'beer', 2, now] })

    for (const sql of await statements('0009_shifts_earned_perks.sql')) await client.execute(sql)

    const tables = (await client.execute('SELECT name FROM sqlite_master WHERE type = \'table\'')).rows.map(row => row.name)
    expect(tables).toContain('shift_earned_perks')
    expect(tables).not.toContain('shift_perk_grants')
    const rows = (await client.execute('SELECT id, voucherType, quantity FROM shift_earned_perks')).rows.map(row => ({ ...row }))
    expect(rows).toEqual([{ id: 'spg_1', voucherType: 'beer', quantity: 2 }])
    const indexes = (await client.execute('SELECT name FROM sqlite_master WHERE type = \'index\' AND tbl_name = \'shift_earned_perks\'')).rows.map(row => row.name)
    expect(indexes).toEqual(expect.arrayContaining(['shift_earned_perk_unique', 'shift_earned_perk_user_idx', 'shift_earned_perk_assignment_idx']))
    // Still one per perk and assignment.
    await expect(client.execute({ sql: 'INSERT INTO shift_earned_perks (id, perkId, assignmentId, userId, voucherType, quantity, earnedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', args: ['spg_2', 'spk_1', 'sha_1', 1, 'beer', 2, now] })).rejects.toThrow()
    client.close()
  })
})
