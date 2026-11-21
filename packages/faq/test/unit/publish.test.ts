import { describe, expect, it } from 'vitest'
import { DEFAULT_REQUIRED_LOCALES, describeMissingTranslations, hasLocaleText, missingTranslations } from '../../src/runtime/utils'

describe('the publish rule', () => {
  it('requires da and en by default', () => {
    expect(DEFAULT_REQUIRED_LOCALES).toEqual(['da', 'en'])
  })

  it('has nothing missing when every required locale has text in the question and the answer', () => {
    expect(missingTranslations({ question: { da: 'Hvad?', en: 'What?' }, answer: { da: 'Det', en: 'That' } })).toEqual([])
  })

  it('names the locales missing in each field', () => {
    expect(missingTranslations({ question: { en: 'What?' }, answer: { da: 'Det' } })).toEqual([
      { field: 'question', locales: ['da'] },
      { field: 'answer', locales: ['en'] },
    ])
  })

  it('counts blank text as missing', () => {
    expect(missingTranslations({ question: { da: '  ', en: 'What?' }, answer: { da: 'Det', en: '' } })).toEqual([
      { field: 'question', locales: ['da'] },
      { field: 'answer', locales: ['en'] },
    ])
  })

  it('does not count a plain string as text in any language: each language is written on purpose', () => {
    expect(hasLocaleText('Same everywhere', 'da')).toBe(false)
    expect(missingTranslations({ question: 'Q', answer: 'A' })).toEqual([
      { field: 'question', locales: ['da', 'en'] },
      { field: 'answer', locales: ['da', 'en'] },
    ])
  })

  it('follows the required locales it is given', () => {
    expect(missingTranslations({ question: { en: 'What?' }, answer: { en: 'That' } }, ['en'])).toEqual([])
    expect(missingTranslations({ question: { en: 'What?' }, answer: { en: 'That' } }, ['en', 'sv'])).toEqual([
      { field: 'question', locales: ['sv'] },
      { field: 'answer', locales: ['sv'] },
    ])
  })

  it('describes what is missing in the error message', () => {
    expect(describeMissingTranslations([{ field: 'question', locales: ['da'] }, { field: 'answer', locales: ['da', 'en'] }]))
      .toBe('An item needs text in every required language before it is published. Missing: question (da); answer (da, en).')
  })
})
