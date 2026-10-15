import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createEventLinks, fillPath } from '../../src/runtime/utils'

// What `useLocaleLink().localize` of @frigear-nu/ui does under `@nuxtjs/i18n` with the `/en` prefix.
const localizeEn = (path: string) => (path.startsWith('/') ? `/en${path}` : path)

describe('event links (#183)', () => {
  it('fills the :slug and :id params URL-safely', () => {
    expect(fillPath('/events/:slug', 'slug', 'summer party')).toBe('/events/summer%20party')
    expect(fillPath('/admin/events/:id', 'id', 'evn_1')).toBe('/admin/events/evn_1')
  })

  it('keeps the locale prefix on every link to an event', () => {
    const links = createEventLinks(undefined, localizeEn)
    expect(links.events()).toBe('/en/events')
    expect(links.event('summer-party')).toBe('/en/events/summer-party')
    expect(links.tickets()).toBe('/en/account/tickets')
    expect(links.admin()).toBe('/en/admin/events')
    expect(links.adminEvent('evn_1')).toBe('/en/admin/events/evn_1')
  })

  it('follows the configured page paths', () => {
    const links = createEventLinks({ event: '/arrangementer/:slug', adminEvent: '/staff/events/:id' }, localizeEn)
    expect(links.event('fest')).toBe('/en/arrangementer/fest')
    expect(links.adminEvent('evn_2')).toBe('/en/staff/events/evn_2')
  })

  it('leaves paths alone without i18n', () => {
    const links = createEventLinks(undefined, path => path)
    expect(links.event('fest')).toBe('/events/fest')
  })

  it('has no page building an event path by hand', () => {
    const root = fileURLToPath(new URL('../../src/runtime/app', import.meta.url))
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(?:vue|ts)$/.test(name)) files.push(path)
      }
    }
    walk(root)
    const offenders = files.filter(file => /\.replace\(\s*':(?:slug|id)'/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
