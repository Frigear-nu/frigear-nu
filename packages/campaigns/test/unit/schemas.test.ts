import { describe, expect, it } from 'vitest'
import { campaignEmbedSnippet } from '../../src/runtime/utils/links'
import { campaignListCreateInput, campaignMySubscriptionsPatch, campaignSubscribeInput, normalizeCampaignEmail, normalizeCampaignPhone } from '../../src/runtime/utils/schemas'
import { campaignSignupChannels } from '../../src/runtime/utils/consent'

describe('addresses', () => {
  it('lower-cases and trims email addresses', () => {
    expect(normalizeCampaignEmail('  Kari@Example.ORG ')).toBe('kari@example.org')
  })

  it('reads phone numbers as E.164', () => {
    expect(normalizeCampaignPhone('+45 12 34 56 78')).toBe('+4512345678')
    expect(normalizeCampaignPhone('0045-12-34-56-78')).toBe('+4512345678')
    expect(normalizeCampaignPhone('(+45) 12.34.56.78')).toBe('+4512345678')
    expect(normalizeCampaignPhone('12345678')).toBeNull()
    expect(normalizeCampaignPhone('+0123456789')).toBeNull()
    expect(normalizeCampaignPhone('+45 abc')).toBeNull()
  })
})

describe('subscribe input', () => {
  it('takes JSON', () => {
    const value = campaignSubscribeInput.parse({ email: ' Kari@Example.org', name: 'Kari', consent: true, channels: ['email'], locale: 'da' })
    expect(value).toMatchObject({ email: 'kari@example.org', name: 'Kari', consent: true, channels: ['email'], locale: 'da' })
  })

  it('takes a plain HTML form: a checked box, empty fields and one channel as text', () => {
    const value = campaignSubscribeInput.parse({ email: 'kari@example.org', phone: '', name: '', consent: 'on', channels: 'email', website: '' })
    expect(value.consent).toBe(true)
    expect(value.phone).toBeUndefined()
    expect(value.name).toBeUndefined()
    expect(value.channels).toEqual(['email'])
  })

  it('needs consent, and an email address or a phone number', () => {
    expect(campaignSubscribeInput.safeParse({ email: 'kari@example.org' }).success).toBe(false)
    expect(campaignSubscribeInput.safeParse({ email: 'kari@example.org', consent: 'false' }).success).toBe(false)
    expect(campaignSubscribeInput.safeParse({ consent: true }).success).toBe(false)
    expect(campaignSubscribeInput.safeParse({ phone: '+4512345678', consent: true }).success).toBe(true)
  })

  it('refuses bad addresses, locales and channels', () => {
    expect(campaignSubscribeInput.safeParse({ email: 'not-an-email', consent: true }).success).toBe(false)
    expect(campaignSubscribeInput.safeParse({ phone: '12345', consent: true }).success).toBe(false)
    expect(campaignSubscribeInput.safeParse({ email: 'kari@example.org', consent: true, locale: '../x' }).success).toBe(false)
    expect(campaignSubscribeInput.safeParse({ email: 'kari@example.org', consent: true, channels: ['fax'] }).success).toBe(false)
  })

  it('normalises a phone number given with spaces', () => {
    expect(campaignSubscribeInput.parse({ phone: '+45 12 34 56 78', consent: true }).phone).toBe('+4512345678')
  })
})

describe('signup channels', () => {
  const both = { channels: ['email', 'sms'] as Array<'email' | 'sms'> }
  it('keeps the channels the list offers and an address was given for', () => {
    expect(campaignSignupChannels(both, { email: 'a@b.dk' })).toEqual(['email'])
    expect(campaignSignupChannels(both, { email: 'a@b.dk', phone: '+4512345678' })).toEqual(['email', 'sms'])
    expect(campaignSignupChannels(both, { email: 'a@b.dk', phone: '+4512345678', channels: ['sms'] })).toEqual(['sms'])
    expect(campaignSignupChannels({ channels: ['email'] }, { phone: '+4512345678' })).toEqual([])
  })
})

describe('list input', () => {
  it('defaults to email, double opt-in and a public signup', () => {
    expect(campaignListCreateInput.parse({ slug: 'news', name: { da: 'Nyheder', en: 'News' } })).toMatchObject({ channels: ['email'], doubleOptIn: true, public: true })
  })

  it('refuses a bad slug, an empty name and a channel twice', () => {
    expect(campaignListCreateInput.safeParse({ slug: 'News Letter', name: 'News' }).success).toBe(false)
    expect(campaignListCreateInput.safeParse({ slug: 'news', name: { da: '', en: '' } }).success).toBe(false)
    expect(campaignListCreateInput.safeParse({ slug: 'news', name: 'News', channels: ['email', 'email'] }).success).toBe(false)
  })

  it('takes per-list channel changes on the account page', () => {
    expect(campaignMySubscriptionsPatch.safeParse({ lists: { cml_1: { email: true } } }).success).toBe(true)
    expect(campaignMySubscriptionsPatch.safeParse({ lists: { cml_1: { fax: true } } }).success).toBe(false)
  })
})

describe('embed snippet', () => {
  it('posts to the subscribe route with the list\'s fields, a honeypot and escaped texts', () => {
    const html = campaignEmbedSnippet({
      action: 'https://site.test/api/campaigns/lists/news/subscribe',
      channels: ['email'],
      locale: 'da',
      texts: { name: 'Name', email: 'Email', phone: 'Phone', consent: 'Yes <please>', submit: 'Sign up' },
    })
    expect(html).toContain('action="https://site.test/api/campaigns/lists/news/subscribe" method="post"')
    expect(html).toContain('name="email"')
    expect(html).not.toContain('name="phone"')
    expect(html).toContain('name="website"')
    expect(html).toContain('Yes &lt;please&gt;')
    expect(html).toContain('name="locale" value="da"')
  })
})
