import { describe, expect, it } from 'vitest'
import { previewPayload, previewScale } from '../../src/runtime/utils'
import type { FormDefinition } from '../../src/types'

const definition = {
  mode: 'single',
  storage: 'db',
  steps: [{
    id: 'main',
    fields: [
      { key: 'name', type: 'text' },
      { key: 'kind', type: 'select', options: [{ value: 'a', label: 'A' }, { value: 'other', label: 'Other' }] },
      { key: 'other', type: 'text', showIf: { field: 'kind', op: 'eq', value: 'other' } },
      { key: 'docs', type: 'file' },
      { key: 'intro', type: 'markdown' },
      { key: 'human', type: 'captcha' },
    ],
  }],
} as unknown as FormDefinition

describe('previewPayload', () => {
  it('keeps visible answers only and drops unset ones', () => {
    expect(previewPayload(definition, { name: 'Ada', kind: 'a', other: 'hidden', docs: [] })).toEqual({ name: 'Ada', kind: 'a', docs: [] })
    expect(previewPayload(definition, { name: 'Ada', kind: 'other', other: 'shown' })).toEqual({ name: 'Ada', kind: 'other', other: 'shown' })
  })
  it('never includes the captcha token', () => {
    expect(previewPayload(definition, { name: 'Ada', human: 'preview' })).toEqual({ name: 'Ada' })
  })
  it('describes files', () => {
    const file = new File(['abc'], 'a.txt', { type: 'text/plain' })
    expect(previewPayload(definition, { docs: [file] }).docs).toEqual([{ name: 'a.txt', size: 3, type: 'text/plain' }])
  })
})

describe('previewScale', () => {
  it('scales down but never up', () => {
    expect(previewScale(480, 960)).toBe(0.5)
    expect(previewScale(1000, 390)).toBe(1)
  })
  it('falls back safely', () => {
    expect(previewScale(0, 960)).toBe(1)
    expect(previewScale(10, 960)).toBe(0.1)
  })
})
