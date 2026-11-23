import type { Nuxt } from '@nuxt/schema'
import { describe, expect, it } from 'vitest'
import { guardPages, localizedRoutePatterns } from '../../src/runtime/utils/build'
import { pickAccessRouteRules, resolveAccessRouteRule } from '../../src/runtime/utils/route-rules'

const fakeNuxt = (options: Record<string, unknown> = {}) => ({ options }) as unknown as Nuxt

describe('localizedRoutePatterns', () => {
  it('returns the patterns as given without i18n', () => {
    expect(localizedRoutePatterns(fakeNuxt(), ['/help', '/help/**'])).toEqual(['/help', '/help/**'])
  })

  it('adds every locale prefix, codes or locale objects', () => {
    const nuxt = fakeNuxt({ i18n: { locales: ['da', { code: 'en' }] } })
    expect(localizedRoutePatterns(nuxt, ['/help', '/help/**'])).toEqual(['/help', '/help/**', '/da/help', '/da/help/**', '/en/help', '/en/help/**'])
  })
})

describe('guardPages', () => {
  it('sets `authenticated: true` under every prefix and returns the patterns', () => {
    const nuxt = fakeNuxt({ i18n: { locales: [{ code: 'da' }] } })
    expect(guardPages(nuxt, ['/me'])).toEqual(['/me', '/da/me'])
    expect(nuxt.options.routeRules).toEqual({ '/me': { authenticated: true }, '/da/me': { authenticated: true } })
  })

  it('guards case variants of the paths, with and without the locale prefix', () => {
    const nuxt = fakeNuxt({ i18n: { locales: ['da', 'en'] } })
    guardPages(nuxt, ['/me', '/me/**'])
    const rules = pickAccessRouteRules(nuxt.options.routeRules as Record<string, unknown>)
    for (const path of ['/me', '/ME', '/Me/', '/da/me', '/DA/me', '/da/ME', '/EN/me/profile']) {
      expect(resolveAccessRouteRule(rules, path), path).toEqual({ authenticated: true })
    }
    expect(resolveAccessRouteRule(rules, '/men')).toBeUndefined()
  })

  it('adds the layout and keeps what a rule already says', () => {
    const nuxt = fakeNuxt({ routeRules: { '/help/**': { authenticated: false, appLayout: 'docs' } } })
    guardPages(nuxt, ['/help', '/help/**'], { layout: 'site' })
    expect(nuxt.options.routeRules).toEqual({
      '/help': { authenticated: true, appLayout: 'site' },
      '/help/**': { authenticated: false, appLayout: 'docs' },
    })
  })
})
