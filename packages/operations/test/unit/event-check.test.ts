import { beforeEach, describe, expect, it, vi } from 'vitest'

// A stubbed schema: the `events` table exists only when a test says events is installed, like `@frigear-nu/events`.
const state = vi.hoisted(() => ({ rows: [] as unknown[], withEvents: true, queried: 0 }))

vi.mock('@nuxthub/db', async () => {
  const { sqliteTable, text, integer } = await import('drizzle-orm/sqlite-core')
  const events = sqliteTable('events', { id: text().primaryKey(), startsAt: integer() })
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => {
      state.queried++
      return state.rows
    },
  }
  return {
    db: { select: () => chain },
    get schema() { return state.withEvents ? { operations: {}, events } : { operations: {} } },
  }
})

const { assertOperationEventExists } = await import('../../src/runtime/server/utils/operations')

describe('eventId check', () => {
  beforeEach(() => Object.assign(state, { rows: [], withEvents: true, queried: 0 }))

  it('accepts a missing id without looking', async () => {
    await expect(assertOperationEventExists(null)).resolves.toBeUndefined()
    await expect(assertOperationEventExists(undefined)).resolves.toBeUndefined()
    await expect(assertOperationEventExists('')).resolves.toBeUndefined()
    expect(state.queried).toBe(0)
  })

  it('accepts any id as it is when events is not installed', async () => {
    state.withEvents = false
    await expect(assertOperationEventExists('evn_unknown')).resolves.toBeUndefined()
    expect(state.queried).toBe(0)
  })

  it('refuses an unknown event with a 400 when events is installed', async () => {
    await expect(assertOperationEventExists('evn_unknown')).rejects.toMatchObject({ statusCode: 400 })
    expect(state.queried).toBe(1)
  })

  it('accepts a known event', async () => {
    state.rows = [{ id: 'evn_1' }]
    await expect(assertOperationEventExists('evn_1')).resolves.toBeUndefined()
  })
})
