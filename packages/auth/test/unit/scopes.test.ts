import { describe, expect, it } from 'vitest'
import { parseScopeString } from '../../src/runtime/utils/scopes'

describe('parseScopeString', () => {
  it('splits on whitespace and de-duplicates', () => {
    expect(parseScopeString('openid  profile\temail profile')).toEqual(['openid', 'profile', 'email'])
    expect(parseScopeString('')).toEqual([])
    expect(parseScopeString(undefined)).toEqual([])
  })
})
