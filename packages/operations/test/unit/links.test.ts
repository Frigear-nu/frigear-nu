import { describe, expect, it } from 'vitest'
import { createOperationLinks, fillPath } from '../../src/runtime/utils'

// What `useLocaleLink().localize` of @frigear-nu/ui does under `@nuxtjs/i18n` with the `/en` prefix.
const localizeEn = (path: string) => (path.startsWith('/') ? `/en${path}` : path)

describe('operation links', () => {
  it('fills the :slug and :id params URL-safely', () => {
    expect(fillPath('/operations/:slug', 'slug', 'bar 2027')).toBe('/operations/bar%202027')
    expect(fillPath('/admin/operations/:id', 'id', 'opr_1')).toBe('/admin/operations/opr_1')
  })

  it('keeps the locale prefix and follows the configured pages', () => {
    const links = createOperationLinks(undefined, localizeEn)
    expect(links.operation('bar-2027')).toBe('/en/operations/bar-2027')
    expect(links.admin()).toBe('/en/admin/operations')
    expect(links.adminOperation('opr_1')).toBe('/en/admin/operations/opr_1')

    const custom = createOperationLinks({ public: '/occasions/:slug' }, localizeEn)
    expect(custom.operation('bar-2027')).toBe('/en/occasions/bar-2027')
  })
})
