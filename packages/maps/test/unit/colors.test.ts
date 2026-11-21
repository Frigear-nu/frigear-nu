import { describe, expect, it } from 'vitest'
import { MAP_COLORS, featureColor, safeColor } from '../../src/runtime/app/utils/leaflet'

describe('feature colours', () => {
  it('accepts palette names, hex and plain rgb()/hsl() values', () => {
    expect(safeColor('warning')).toBe(MAP_COLORS.warning)
    expect(safeColor('#0af')).toBe('#0af')
    expect(safeColor('#00aaff80')).toBe('#00aaff80')
    expect(safeColor('rgb(10, 20, 30)')).toBe('rgb(10, 20, 30)')
    expect(safeColor('hsl(210 50% 40% / 0.5)')).toBe('hsl(210 50% 40% / 0.5)')
  })

  it('refuses anything that could break out of an attribute or a style', () => {
    for (const value of ['red;background:url(x)', '"><script>', 'url(javascript:x)', 'var(--x)', '#12', 'constructor', 'toString', 3, null]) {
      expect(safeColor(value)).toBeNull()
    }
  })

  it('falls back to the kind colour, then the primary', () => {
    expect(featureColor('"><img>', 'error')).toBe(MAP_COLORS.error)
    expect(featureColor(undefined, 'nope)')).toBe(MAP_COLORS.primary)
    expect(featureColor('#123456', 'error')).toBe('#123456')
  })
})
