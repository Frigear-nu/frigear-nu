import { describe, expect, it } from 'vitest'
import { challengeFor, createPkcePair, randomString } from '../../src/runtime/core'

describe('PKCE', () => {
  it('computes the S256 challenge of the RFC 7636 appendix B example', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('creates verifiers within the allowed length and alphabet', async () => {
    const { verifier, challenge } = await createPkcePair()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
    expect(verifier).toMatch(/^[\w-]+$/)
    expect(challenge).toBe(await challengeFor(verifier))
  })

  it('creates a different random string every time', () => {
    expect(randomString()).not.toBe(randomString())
  })
})
