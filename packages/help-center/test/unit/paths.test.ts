import { describe, expect, it } from 'vitest'
import { DEFAULT_PUBLIC_PATH, DEFAULT_SIGNED_IN_PATH, createHelpCenterPaths, helpCenterRoutePatterns, isPathUnder, normalizeHelpCenterPath, resolveHelpCenterAreas } from '../../src/runtime/utils/paths'

describe('where the areas live', () => {
  it('defaults to /help and /account/help: both areas are on unless false', () => {
    expect(resolveHelpCenterAreas(undefined)).toEqual({ public: DEFAULT_PUBLIC_PATH, signedIn: DEFAULT_SIGNED_IN_PATH })
    expect(resolveHelpCenterAreas({})).toEqual({ public: '/help', signedIn: '/account/help' })
    expect(resolveHelpCenterAreas({ public: true, signedIn: true })).toEqual({ public: '/help', signedIn: '/account/help' })
  })

  it('takes a second option set: custom paths for both areas', () => {
    expect(resolveHelpCenterAreas({ public: '/hjaelp', signedIn: '/crew/help' })).toEqual({ public: '/hjaelp', signedIn: '/crew/help' })
    expect(resolveHelpCenterAreas({ public: '/faq/' })).toEqual({ public: '/faq', signedIn: '/account/help' })
  })

  it('turns an area off with false', () => {
    expect(resolveHelpCenterAreas({ public: false })).toEqual({ public: undefined, signedIn: '/account/help' })
    expect(resolveHelpCenterAreas({ signedIn: false })).toEqual({ public: '/help', signedIn: undefined })
    expect(resolveHelpCenterAreas({ public: false, signedIn: false })).toEqual({ public: undefined, signedIn: undefined })
  })

  it('refuses a path that is not a path, and two areas on one path', () => {
    for (const bad of ['help', '', '/', '//help', '/he lp', '/help?x=1', '/help#top', '/a//b', '/a/../b']) {
      expect(() => resolveHelpCenterAreas({ public: bad }), bad).toThrow(/settings\.pages\.public/)
    }
    expect(() => resolveHelpCenterAreas({ signedIn: 'crew' })).toThrow(/settings\.pages\.signedIn/)
    expect(() => resolveHelpCenterAreas({ public: '/help', signedIn: '/help' })).toThrow(/overlap/)
  })

  it('refuses one area inside the other, either way round', () => {
    expect(() => resolveHelpCenterAreas({ public: '/account', signedIn: '/account/help' })).toThrow(/overlap/)
    expect(() => resolveHelpCenterAreas({ public: '/help/public', signedIn: '/help' })).toThrow(/overlap/)
    // A shared prefix of words is not nesting.
    expect(resolveHelpCenterAreas({ public: '/help', signedIn: '/helpers' })).toEqual({ public: '/help', signedIn: '/helpers' })
  })

  it('normalises a trailing slash', () => {
    expect(normalizeHelpCenterPath('/help/', 'public')).toBe('/help')
  })

  it('knows what is under a path', () => {
    expect(isPathUnder('/account/help', '/account')).toBe(true)
    expect(isPathUnder('/account', '/account')).toBe(true)
    expect(isPathUnder('/accounts/help', '/account')).toBe(false)
    expect(isPathUnder('/crew/help', '/account')).toBe(false)
  })

  it('has the three page routes of an area', () => {
    expect(helpCenterRoutePatterns('/help')).toEqual({ index: '/help', category: '/help/:category', article: '/help/:category/:slug' })
  })
})

describe('the path builders', () => {
  it('build every link from the configured bases', () => {
    const paths = createHelpCenterPaths({ public: '/hjaelp', signedIn: '/crew/help' })
    expect(paths.public.index()).toBe('/hjaelp')
    expect(paths.public.category('safety')).toBe('/hjaelp/safety')
    expect(paths.public.article('safety', 'first-aid')).toBe('/hjaelp/safety/first-aid')
    expect(paths.signedIn.index()).toBe('/crew/help')
    expect(paths.signedIn.article('safety', 'first-aid')).toBe('/crew/help/safety/first-aid')
  })

  it('encode what they put in a path', () => {
    expect(createHelpCenterPaths({ public: '/help' }).public.article('a b', 'c/d')).toBe('/help/a%20b/c%2Fd')
  })

  it('answer undefined for an area that is off, so a template can pass it to `to`', () => {
    const paths = createHelpCenterPaths({ public: '/help' })
    expect(paths.signedIn.index()).toBeUndefined()
    expect(paths.signedIn.article('a', 'b')).toBeUndefined()
    expect(paths.signedIn.base).toBeUndefined()
  })
})
