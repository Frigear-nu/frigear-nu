import { describe, expect, it } from 'vitest'
import { DEFAULT_REQUIRED_LOCALES, describeMissingTranslations, hasLocaleText, missingTranslations } from '../../src/runtime/utils'

describe('the publish rule', () => {
  it('requires da and en by default', () => {
    expect(DEFAULT_REQUIRED_LOCALES).toEqual(['da', 'en'])
  })

  it('has nothing missing when every required locale has text in the title and the body', () => {
    expect(missingTranslations({ title: { da: 'Hvad?', en: 'What?' }, body: { da: 'Det', en: 'That' } })).toEqual([])
  })

  it('names the locales missing in each field', () => {
    expect(missingTranslations({ title: { en: 'What?' }, body: { da: 'Det' } })).toEqual([
      { field: 'title', locales: ['da'] },
      { field: 'body', locales: ['en'] },
    ])
  })

  it('counts blank text as missing', () => {
    expect(missingTranslations({ title: { da: '  ', en: 'What?' }, body: { da: 'Det', en: '' } })).toEqual([
      { field: 'title', locales: ['da'] },
      { field: 'body', locales: ['en'] },
    ])
  })

  it('does not count a plain string as text in any language: each language is written on purpose', () => {
    expect(hasLocaleText('Same everywhere', 'da')).toBe(false)
    expect(missingTranslations({ title: 'T', body: 'B' })).toEqual([
      { field: 'title', locales: ['da', 'en'] },
      { field: 'body', locales: ['da', 'en'] },
    ])
  })

  it('follows the required locales it is given', () => {
    expect(missingTranslations({ title: { en: 'What?' }, body: { en: 'That' } }, ['en'])).toEqual([])
    expect(missingTranslations({ title: { en: 'What?' }, body: { en: 'That' } }, ['en', 'sv'])).toEqual([
      { field: 'title', locales: ['sv'] },
      { field: 'body', locales: ['sv'] },
    ])
  })

  it('describes what is missing in the error message', () => {
    expect(describeMissingTranslations([{ field: 'title', locales: ['da'] }, { field: 'body', locales: ['da', 'en'] }]))
      .toBe('An article needs text in every required language before it is published. Missing: title (da); body (da, en).')
  })
})
