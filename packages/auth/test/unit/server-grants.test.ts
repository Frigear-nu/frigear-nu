import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { H3Event } from 'h3'
import { defineGrantKind } from '../../src/runtime/utils/grants'
import publicKind from '../../src/runtime/server/grants/public'
import signedInKind from '../../src/runtime/server/grants/signed-in'

// The server grant helpers against a stubbed registry (`#auth/grant-kinds`) and a stubbed `allows`.
const validateTeam = vi.fn(async ({ grant }: { grant: { team: number } }) => grant.team === 404 ? 'No such team.' : undefined)
vi.mock('#auth/grant-kinds', () => ({
  kinds: [
    publicKind,
    signedInKind,
    defineGrantKind('team', {
      schema: z.strictObject({ kind: z.literal('team'), team: z.number().int().positive() }),
      matches: () => false,
      members: () => [],
      validate: validateTeam,
    }),
  ],
}))
const allows = vi.fn(async () => false)
vi.mock('../../src/runtime/server/utils/access', () => ({ allows }))

const { grantsArePublic, grantsCanRead, grantsListSchema, grantsValidate } = await import('../../src/runtime/server/utils/grants')

const event = {} as H3Event

beforeEach(() => {
  allows.mockReset().mockResolvedValue(false)
  validateTeam.mockClear()
})

describe('grantsCanRead', () => {
  it('serves a record with a valid public grant to everyone, without asking allows', async () => {
    expect(await grantsCanRead(event, 'help:read', { grants: [{ kind: 'team', team: 1 }, { kind: 'public' }] })).toBe(true)
    expect(allows).not.toHaveBeenCalled()
  })

  it('does not treat an invalid public grant as public: allows decides (fail closed)', async () => {
    const record = { grants: [{ kind: 'public', x: 1 }] }
    expect(grantsArePublic(record.grants)).toBe(false)
    expect(await grantsCanRead(event, 'help:read', record)).toBe(false)
    expect(allows).toHaveBeenCalledWith(event, 'help:read', record)
  })

  it('asks allows for every other record and returns its answer', async () => {
    const record = { grants: [{ kind: 'signed-in' }] }
    allows.mockResolvedValueOnce(true)
    expect(await grantsCanRead(event, 'help:read', record)).toBe(true)
    expect(await grantsCanRead(event, 'help:read', { grants: 'not a list' })).toBe(false)
    expect(allows).toHaveBeenCalledTimes(2)
  })
})

describe('grantsListSchema', () => {
  it('accepts known, valid grants and returns them parsed', () => {
    expect(grantsListSchema().parse([{ kind: 'public' }, { kind: 'team', team: 3 }])).toEqual([{ kind: 'public' }, { kind: 'team', team: 3 }])
  })

  it('refuses unknown kinds and grants their schema refuses, at their index', () => {
    const result = grantsListSchema().safeParse([{ kind: 'public' }, { kind: 'ghost' }, { kind: 'public', x: 1 }])
    expect(result.success).toBe(false)
    expect(result.error?.issues.map(issue => issue.path)).toEqual([[1], [2]])
  })

  it('refuses a list that is not in the shape', () => {
    expect(grantsListSchema().safeParse([{ kind: 'Not A Kind' }]).success).toBe(false)
    expect(grantsListSchema().safeParse({ kind: 'public' }).success).toBe(false)
  })
})

describe('grantsValidate', () => {
  const issuesOf = async (promise: Promise<unknown>) => {
    const error = await promise.then(() => null, (thrown: { statusCode?: number, data?: { code?: string, issues?: unknown } }) => thrown)
    expect(error?.statusCode).toBe(400)
    expect(error?.data?.code).toBe('validation_failed')
    return error?.data?.issues
  }

  it('returns the list as stored when every grant is valid', async () => {
    expect(await grantsValidate(event, [{ kind: 'public' }, { kind: 'team', team: 1 }])).toEqual([{ kind: 'public' }, { kind: 'team', team: 1 }])
    expect(validateTeam).toHaveBeenCalledTimes(1)
  })

  it('answers 400 for an unknown kind or an invalid grant, under the field, without running validate', async () => {
    expect(await issuesOf(grantsValidate(event, [{ kind: 'ghost' }, { kind: 'public', x: 1 }], { field: 'audience' }))).toEqual([
      { path: ['audience', 0], message: 'Unknown grant kind "ghost".' },
      { path: ['audience', 1], message: 'This "public" grant is not valid.' },
    ])
    expect(validateTeam).not.toHaveBeenCalled()
  })

  it('answers 400 when a kind\'s validate refuses a new grant', async () => {
    expect(await issuesOf(grantsValidate(event, [{ kind: 'public' }, { kind: 'team', team: 404 }]))).toEqual([
      { path: ['grants', 1], message: 'No such team.' },
    ])
  })

  it('skips validate for a grant already stored, so a record whose team is gone can still be edited', async () => {
    const stored = [{ kind: 'team', team: 404 }]
    expect(await grantsValidate(event, [{ kind: 'team', team: 404 }], { stored })).toEqual(stored)
    expect(validateTeam).not.toHaveBeenCalled()
  })
})
