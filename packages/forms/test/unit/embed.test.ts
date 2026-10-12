import { describe, expect, it } from 'vitest'
import { embedMode } from '../../src/runtime/utils'
import type { FormAccessInfoDto } from '../../src/types'

const info = (access: FormAccessInfoDto['access'], signedIn = false): FormAccessInfoDto => ({ slug: 's', name: 'S', access, signedIn })

describe('embedMode', () => {
  it('renders the form for open web forms', () => {
    expect(embedMode(info({ availability: 'web', auth: 'none' }))).toBe('form')
  })
  it('is not-found without access info', () => {
    expect(embedMode(null)).toBe('not-found')
    expect(embedMode(undefined)).toBe('not-found')
  })
  it('asks anonymous visitors to sign in, lets signed in users through', () => {
    expect(embedMode(info({ availability: 'web', auth: 'user' }))).toBe('sign-in')
    expect(embedMode(info({ availability: 'web', auth: 'user' }, true))).toBe('form')
  })
  it('gates password forms', () => {
    expect(embedMode(info({ availability: 'web', auth: 'password' }))).toBe('password')
  })
  it('renders nothing for API-only and token forms', () => {
    expect(embedMode(info({ availability: 'api', auth: 'none' }))).toBe('hidden')
    expect(embedMode(info({ availability: 'web', auth: 'token' }))).toBe('hidden')
  })
})
