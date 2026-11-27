import { describe, expect, it } from 'vitest'
import { applyDevSessionCookie } from '../../src/session-cookie'

describe('applyDevSessionCookie', () => {
  it('drops Secure under nuxt dev (plain http, where Safari would drop the cookie)', () => {
    expect(applyDevSessionCookie({ cookie: { sameSite: 'lax' } }, true).cookie).toEqual({ sameSite: 'lax', secure: false })
    expect(applyDevSessionCookie({}, true).cookie).toEqual({ secure: false })
  })

  it('leaves a production build on the default Secure cookie', () => {
    expect(applyDevSessionCookie({ maxAge: 10 }, false)).toEqual({ maxAge: 10 })
  })

  it('never overrides the app\'s own setting', () => {
    expect(applyDevSessionCookie({ cookie: { secure: true } }, true).cookie).toEqual({ secure: true })
  })
})
