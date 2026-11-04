import { describe, expect, it } from 'vitest'
import { isExactOrigin, matchesPathPrefix, parseList, resolveIssuerUrls } from '../src/runtime/utils'

describe('config helpers', () => {
  it('reads lists from config and env', () => {
    expect(parseList('capacitor://localhost, https://localhost ,')).toEqual(['capacitor://localhost', 'https://localhost'])
    expect(parseList(['frigear-services'])).toEqual(['frigear-services'])
    expect(parseList(undefined)).toEqual([])
  })

  it('accepts exact origins only', () => {
    expect(isExactOrigin('capacitor://localhost')).toBe(true)
    expect(isExactOrigin('https://localhost')).toBe(true)
    expect(isExactOrigin('http://localhost:3000')).toBe(true)
    expect(isExactOrigin('*')).toBe(false)
    expect(isExactOrigin('https://app.example.com/')).toBe(false)
    expect(isExactOrigin('https://app.example.com/path')).toBe(false)
    expect(isExactOrigin('localhost')).toBe(false)
  })

  it('matches path prefixes on segment boundaries', () => {
    expect(matchesPathPrefix('/api/vouchers', ['/api/'])).toBe(true)
    expect(matchesPathPrefix('/api', ['/api/'])).toBe(true)
    expect(matchesPathPrefix('/apis', ['/api'])).toBe(false)
    expect(matchesPathPrefix('/', ['/api/'])).toBe(false)
  })

  it('derives the issuer endpoints', () => {
    expect(resolveIssuerUrls({})).toEqual({
      issuer: 'https://frigear.nu',
      jwksUrl: 'https://frigear.nu/.well-known/jwks.json',
      userinfoUrl: 'https://frigear.nu/oauth/userinfo',
    })
    expect(resolveIssuerUrls({ issuer: 'https://id.example.test/', jwksUrl: 'https://keys.example.test/jwks' })).toEqual({
      issuer: 'https://id.example.test',
      jwksUrl: 'https://keys.example.test/jwks',
      userinfoUrl: 'https://id.example.test/oauth/userinfo',
    })
  })
})
