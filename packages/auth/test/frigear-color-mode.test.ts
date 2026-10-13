import { describe, it, expect } from 'vitest'
import { parseColorModeClaim } from '../src/runtime/server/utils/frigear-color-mode'

describe('parseColorModeClaim', () => {
  it('accepts the known modes', () => {
    expect(parseColorModeClaim('light')).toBe('light')
    expect(parseColorModeClaim('dark')).toBe('dark')
    expect(parseColorModeClaim('system')).toBe('system')
  })

  it('ignores anything else', () => {
    expect(parseColorModeClaim('blue')).toBeUndefined()
    expect(parseColorModeClaim(undefined)).toBeUndefined()
    expect(parseColorModeClaim(1)).toBeUndefined()
  })
})
