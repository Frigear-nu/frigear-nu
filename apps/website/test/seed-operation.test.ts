import { describe, expect, it } from 'vitest'
import { missingSeedOperationValues, seedOperation } from '../server/seed/operation'
import type { SeedOperation } from '../server/seed/operation'

const filled: SeedOperation = {
  slug: 'example-operation',
  name: { da: 'Eksempel', en: 'Example' },
  description: null,
  hostName: null,
  hostUrl: null,
  startsAt: '2000-01-01T00:00:00+00:00',
  endsAt: null,
  public: false,
  location: null,
  teams: [],
}

describe('seed:operation', () => {
  it('lists every required value that is still missing', () => {
    expect(missingSeedOperationValues({ ...filled, slug: null, name: null, startsAt: null })).toEqual(['slug', 'name', 'startsAt'])
    expect(missingSeedOperationValues(filled)).toEqual([])
  })

  it('ships no event data: the required values stay TODO(user) until we fill them in', () => {
    expect(missingSeedOperationValues(seedOperation)).toEqual(['slug', 'name', 'startsAt'])
    expect(seedOperation.location).toBeNull()
    expect(seedOperation.teams).toEqual([])
  })
})
