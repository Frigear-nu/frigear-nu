import { describe, it, expect } from 'vitest'
import { loginRedirect } from '../src/runtime/utils'

describe('loginRedirect', () => {
  it('sends guests to the sign-in page with the page they wanted, query included', () => {
    expect(loginRedirect('/sign-in', '/auth/verify-email-change?code=abc')).toEqual({
      path: '/sign-in',
      query: { redirect: '/auth/verify-email-change?code=abc' },
    })
    expect(loginRedirect('/sign-in', '/account/tickets')).toEqual({ path: '/sign-in', query: { redirect: '/account/tickets' } })
  })

  it('never passes along a path that could leave the site', () => {
    expect(loginRedirect('/sign-in', '//evil.example/x')).toBe('/sign-in')
    expect(loginRedirect('/sign-in', '/\\evil.example')).toBe('/sign-in')
    expect(loginRedirect('/sign-in', 'https://evil.example')).toBe('/sign-in')
    // The shared `isSafeRedirect` of `@frigear-nu/auth/mode`: any backslash and control characters too.
    expect(loginRedirect('/sign-in', '/a\\b')).toBe('/sign-in')
    expect(loginRedirect('/sign-in', '/\t/evil.example')).toBe('/sign-in')
  })

  it('does not point the sign-in page back at itself', () => {
    expect(loginRedirect('/sign-in', '/sign-in?x=1')).toBe('/sign-in')
  })

  it('keeps an absolute redirectTo URL as configured', () => {
    expect(loginRedirect('https://frigear.nu/sign-in', '/account')).toBe('https://frigear.nu/sign-in')
  })
})
