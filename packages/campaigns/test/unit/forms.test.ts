import { describe, expect, it } from 'vitest'
import { campaignFormSignup } from '../../src/runtime/utils/forms'

// A forms submission as a signup of a list that maps the form (`forms:submitted`).
describe('campaignFormSignup', () => {
  const fields = { email: 'mail', phone: 'mobile', name: 'fullName', consent: 'agree' }

  it('signs up with the mapped answers when the consent is ticked', () => {
    expect(campaignFormSignup(fields, { mail: ' Kari@Example.COM ', mobile: '0045 12 34 56 78', fullName: ' Kari ', agree: true }))
      .toEqual({ email: 'kari@example.com', phone: '+4512345678', name: 'Kari' })
    expect(campaignFormSignup(fields, { mail: 'kari@example.com', agree: 'on' })).toEqual({ email: 'kari@example.com' })
    expect(campaignFormSignup(fields, { mobile: '+4512345678', agree: ['yes'] })).toEqual({ phone: '+4512345678' })
  })

  it('signs nobody up without a ticked consent, or without a consent field mapped', () => {
    expect(campaignFormSignup(fields, { mail: 'kari@example.com', agree: false })).toBeNull()
    expect(campaignFormSignup(fields, { mail: 'kari@example.com', agree: 'no' })).toBeNull()
    expect(campaignFormSignup(fields, { mail: 'kari@example.com', agree: [] })).toBeNull()
    expect(campaignFormSignup(fields, { mail: 'kari@example.com' })).toBeNull()
    expect(campaignFormSignup({ email: 'mail' }, { mail: 'kari@example.com', agree: true })).toBeNull()
    expect(campaignFormSignup(null, { mail: 'kari@example.com', agree: true })).toBeNull()
  })

  it('signs nobody up without a valid address', () => {
    expect(campaignFormSignup(fields, { mail: 'not-an-email', mobile: '1234', agree: true })).toBeNull()
    expect(campaignFormSignup(fields, { mail: 42, agree: true })).toBeNull()
    // A bad phone number next to a good email address: the email address alone.
    expect(campaignFormSignup(fields, { mail: 'kari@example.com', mobile: '1234', agree: true })).toEqual({ email: 'kari@example.com' })
  })

  it('caps the name', () => {
    expect(campaignFormSignup(fields, { mail: 'kari@example.com', fullName: 'x'.repeat(200), agree: true })?.name).toHaveLength(120)
  })
})
