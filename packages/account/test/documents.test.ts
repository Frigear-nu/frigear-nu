import { describe, expect, it } from 'vitest'
import { documentLabel, visibleDocuments } from '../src/runtime/app/utils/documents'

const docs = [
  { id: 'handbook', label: { da: 'Håndbog', en: 'Handbook' }, path: '/a.docx' },
  { id: 'crew', label: 'Crew plan', path: '/b.pdf', roles: ['admin', 'crew'] },
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
  it('shows unrestricted documents to everyone and restricted ones only to matching roles', () => {
    expect(visibleDocuments(docs, undefined).map(d => d.id)).toEqual(['handbook'])
    expect(visibleDocuments(docs, 'member').map(d => d.id)).toEqual(['handbook'])
    expect(visibleDocuments(docs, 'crew').map(d => d.id)).toEqual(['handbook', 'crew'])
  })
})
