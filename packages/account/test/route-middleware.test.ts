import { describe, expect, it } from 'vitest'
import { withAppMiddleware } from '../src/route-middleware'

describe('withAppMiddleware', () => {
  it('adds the middleware when the rule has none', () => {
    expect(withAppMiddleware(undefined, 'account-bootstrap')).toEqual({ 'account-bootstrap': true })
  })

  it('keeps a single middleware name', () => {
    expect(withAppMiddleware('auth', 'account-bootstrap')).toEqual({ 'account-bootstrap': true, 'auth': true })
  })

  it('keeps a list of middleware names', () => {
    const merged = withAppMiddleware(['auth', 'onboarding'], 'account-bootstrap')
    expect(merged).toEqual({ 'account-bootstrap': true, 'auth': true, 'onboarding': true })
    expect(merged).not.toHaveProperty('0')
  })

  it('keeps the object form, an explicit false included', () => {
    expect(withAppMiddleware({ 'auth': true, 'account-bootstrap': false }, 'account-bootstrap'))
      .toEqual({ 'auth': true, 'account-bootstrap': false })
  })
})
