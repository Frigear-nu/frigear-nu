import { describe, expect, it } from 'vitest'
import { translate } from '../../src/runtime/utils'

describe('translate', () => {
  it('returns plain strings and empties as they are', () => {
    expect(translate('Hello', 'da')).toBe('Hello')
    expect(translate(null)).toBe('')
  })

  it('falls back to the default locale, then en, then the first filled entry', () => {
    expect(translate({ da: 'Hej', en: 'Hello' }, 'da')).toBe('Hej')
    expect(translate({ de: 'Hallo', da: 'Hej' }, 'sv', 'da')).toBe('Hej')
    expect(translate({ da: 'Hej', en: 'Hello' }, 'sv')).toBe('Hello')
    expect(translate({ da: 'Hej' }, 'sv')).toBe('Hej')
    expect(translate({ da: '', en: 'Hello' }, 'da')).toBe('Hello')
  })
})
