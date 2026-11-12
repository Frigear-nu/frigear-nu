import { describe, expect, it } from 'vitest'
import { documentLabel, visibleDocuments } from '../src/runtime/app/utils/documents'

const docs = [
  { id: 'handbook', label: { da: 'Håndbog', en: 'Handbook' }, path: '/a.docx' },
  { id: 'crew', label: 'Crew plan', path: '/b.pdf', permission: 'crew:read' },
]

describe('documentLabel', () => {
  it('picks the locale, then en, then the first value', () => {
    expect(documentLabel(docs[0]!, 'da')).toBe('Håndbog')
    expect(documentLabel(docs[0]!, 'sv')).toBe('Handbook')
    expect(documentLabel({ id: 'x', path: '/x', label: { da: 'Kun dansk' } }, 'sv')).toBe('Kun dansk')
    expect(documentLabel(docs[1]!, 'da')).toBe('Crew plan')
  })
})

describe('visibleDocuments', () => {
  it('shows unrestricted documents to everyone and gated ones only to a viewer holding the permission', () => {
    expect(visibleDocuments(docs, p => p === 'crew:read').map(d => d.id)).toEqual(['handbook', 'crew'])
    expect(visibleDocuments(docs, () => false).map(d => d.id)).toEqual(['handbook'])
  })

  it('hides gated documents when nothing can be checked (no authorization module)', () => {
    expect(visibleDocuments(docs, undefined).map(d => d.id)).toEqual(['handbook'])
  })
})
