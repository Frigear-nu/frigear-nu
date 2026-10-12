import { describe, expect, it } from 'vitest'
import { collapseTranslated, expandTranslated, filledLocales, hasTranslation, isLocaleCode, readTranslated, translate, writeTranslated } from '../../src/runtime/translated'

describe('translate', () => {
  it('returns plain strings and empties as they are', () => {
    expect(translate('Hello', 'da')).toBe('Hello')
    expect(translate(null)).toBe('')
    expect(translate(undefined, 'da')).toBe('')
  })

  it('prefers the locale, then the fallback, then en, then the first filled entry', () => {
    expect(translate({ da: 'Hej', en: 'Hello' }, 'da')).toBe('Hej')
    expect(translate({ de: 'Hallo', da: 'Hej', en: 'Hello' }, 'sv', 'da')).toBe('Hej')
    expect(translate({ da: 'Hej', en: 'Hello' }, 'sv')).toBe('Hello')
    expect(translate({ da: 'Hej' }, 'sv')).toBe('Hej')
  })

  it('skips empty entries', () => {
    expect(translate({ da: '', en: 'Hello' }, 'da')).toBe('Hello')
  })
})

describe('read / write', () => {
  it('reads one locale without falling back', () => {
    expect(readTranslated({ da: 'Hej' }, 'en')).toBe('')
    expect(readTranslated('Same', 'en')).toBe('Same')
    expect(hasTranslation({ da: 'Hej' }, 'da')).toBe(true)
    expect(hasTranslation('Same', 'da')).toBe(false)
  })

  it('keeps other locales when writing and drops emptied ones', () => {
    expect(writeTranslated({ da: 'Hej', en: 'Hello' }, 'en', 'Hi')).toEqual({ da: 'Hej', en: 'Hi' })
    expect(writeTranslated({ da: 'Hej', en: 'Hello' }, 'en', '')).toEqual({ da: 'Hej' })
    expect(writeTranslated({ da: 'Hej' }, 'da', '')).toBeUndefined()
    expect(writeTranslated('x', 'da', 'y')).toBe('y')
    expect(writeTranslated(undefined, 'da', '')).toBeUndefined()
  })

  it('lists the filled locales', () => {
    expect(filledLocales({ da: 'Hej', en: '' })).toEqual(['da'])
    expect(filledLocales('x')).toEqual([])
  })
})

describe('expand / collapse', () => {
  it('expands a string into the given locale', () => {
    expect(expandTranslated('Hej', 'da')).toEqual({ da: 'Hej' })
    expect(expandTranslated('', 'da')).toBeUndefined()
    expect(expandTranslated({ da: 'x' }, 'en')).toEqual({ da: 'x' })
  })

  it('collapses to locale, then en, then first filled', () => {
    expect(collapseTranslated({ da: 'Hej', en: 'Hello' }, 'da')).toBe('Hej')
    expect(collapseTranslated({ da: 'Hej', en: 'Hello' }, 'sv')).toBe('Hello')
    expect(collapseTranslated({ da: 'Hej' }, 'sv')).toBe('Hej')
    expect(collapseTranslated({}, 'da')).toBeUndefined()
    expect(collapseTranslated('x', 'da')).toBe('x')
  })
})

describe('isLocaleCode', () => {
  it('accepts language codes with regions', () => {
    expect(isLocaleCode('da')).toBe(true)
    expect(isLocaleCode('en-GB')).toBe(true)
    expect(isLocaleCode('pt_BR')).toBe(true)
    expect(isLocaleCode('d')).toBe(false)
    expect(isLocaleCode('<b>')).toBe(false)
  })
})
