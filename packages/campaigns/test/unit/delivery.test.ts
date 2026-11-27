import { describe, expect, it } from 'vitest'
import {
  CAMPAIGN_CLAIM_STALE_MS,
  campaignKindChannels,
  campaignLinkSources,
  campaignNotifyOutcome,
  campaignSendIssues,
  campaignStaleClaimAction,
  campaignUnsubscribeHeaders,
  extractCampaignLinks,
  mapTranslated,
  rewriteCampaignLinks,
} from '../../src/runtime/utils/delivery'
import { campaignTokenKind, signUnsubscribeToken, verifyUnsubscribeToken } from '../../src/runtime/utils/tokens'
import { buildCampaignsEmail, buildCampaignsPush, buildCampaignsSms } from '../../src/runtime/server/utils/campaigns-message'
import type { CampaignsRecipientLinks } from '../../src/runtime/server/utils/campaigns-message'

const short = (url: string) => `https://s.test/l/${encodeURIComponent(url).length}/tok`

describe('links', () => {
  const body = [
    'Read [the news](https://example.org/news?a=1&b=2) and https://example.org/plain.',
    'Jump to [the top](#top), write to [us](mailto:hi@example.org), call tel:+4512345678 or see [a page](/about).',
    'Twice: https://example.org/plain, **https://example.org/bold**',
  ].join('\n\n')

  it('finds each http(s) link once, in order, without trailing punctuation', () => {
    expect(extractCampaignLinks([body, 'http://other.test/x)'])).toEqual([
      'https://example.org/news?a=1&b=2',
      'https://example.org/plain',
      'https://example.org/bold',
      'http://other.test/x',
    ])
  })

  it('rewrites only http(s) links and keeps anchors, mailto, tel and paths', () => {
    const rewritten = rewriteCampaignLinks(body, url => short(url))
    expect(rewritten).not.toContain('https://example.org')
    expect(rewritten).toContain('[the top](#top)')
    expect(rewritten).toContain('mailto:hi@example.org')
    expect(rewritten).toContain('tel:+4512345678')
    expect(rewritten).toContain('[a page](/about)')
    // The full stop and the closing emphasis stay after the replaced link.
    expect(rewritten).toMatch(/\/tok\.\n/)
    expect(rewritten).toMatch(/\/tok\*\*$/)
  })

  it('keeps a link it has no replacement for', () => {
    expect(rewriteCampaignLinks('See https://a.test/x.', () => undefined)).toBe('See https://a.test/x.')
  })

  it('takes links from the channels a campaign uses', () => {
    const content = { email: { subject: 'S', body: { da: 'https://a.test/da', en: 'https://a.test/en' } }, sms: { body: 'https://a.test/sms' }, push: { title: 'T', body: 'B', url: 'https://a.test/push' } }
    expect(extractCampaignLinks(campaignLinkSources(content, ['email']))).toEqual(['https://a.test/da', 'https://a.test/en'])
    expect(extractCampaignLinks(campaignLinkSources(content, ['sms', 'push']))).toEqual(['https://a.test/sms', 'https://a.test/push'])
    expect(mapTranslated({ da: 'a', en: 'b' }, text => text.toUpperCase())).toEqual({ da: 'A', en: 'B' })
  })
})

describe('headers', () => {
  it('builds the RFC 8058 one-click headers', () => {
    expect(campaignUnsubscribeHeaders('https://site.test/api/campaigns/unsubscribe/cmd_x.y')).toEqual({
      'List-Unsubscribe': '<https://site.test/api/campaigns/unsubscribe/cmd_x.y>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
  })
})

describe('claims', () => {
  const now = new Date('2026-01-01T12:00:00Z')
  const old = new Date(now.getTime() - CAMPAIGN_CLAIM_STALE_MS - 1000)

  it('requeues a stale claim, fails it after the last attempt, and leaves the rest', () => {
    expect(campaignStaleClaimAction({ status: 'sending', claimedAt: old, attempts: 1 }, now)).toBe('requeue')
    expect(campaignStaleClaimAction({ status: 'sending', claimedAt: old, attempts: 3 }, now)).toBe('fail')
    expect(campaignStaleClaimAction({ status: 'sending', claimedAt: new Date(now.getTime() - 1000), attempts: 3 }, now)).toBeNull()
    expect(campaignStaleClaimAction({ status: 'queued', claimedAt: old, attempts: 1 }, now)).toBeNull()
    expect(campaignStaleClaimAction({ status: 'sending', claimedAt: null, attempts: 1 }, now)).toBeNull()
  })

  it('maps notify\'s answer to the delivery\'s outcome', () => {
    expect(campaignNotifyOutcome({ channels: ['email'], skipped: {} }, 'email')).toEqual({ status: 'sent', skipReason: null })
    expect(campaignNotifyOutcome({ channels: [], skipped: { sms: 'disabled' } }, 'sms')).toEqual({ status: 'skipped', skipReason: 'disabled' })
    expect(campaignNotifyOutcome({ channels: [], skipped: { push: 'failed' } }, 'push')).toEqual({ status: 'failed', skipReason: null })
    expect(campaignNotifyOutcome({ channels: [], skipped: {} }, 'email')).toEqual({ status: 'skipped', skipReason: 'unavailable' })
  })
})

describe('send issues', () => {
  const ready = { kind: 'newsletter' as const, channels: ['email' as const], audience: { listIds: ['cml_1'] }, content: { email: { subject: 'Hi', body: 'Text' } }, important: false }

  it('is empty for a campaign that is ready', () => {
    expect(campaignSendIssues(ready)).toEqual([])
    expect(campaignSendIssues({ ...ready, kind: 'message', channels: ['push'], audience: { userIds: ['1'] }, content: { push: { title: 'T', body: 'B' } }, important: true })).toEqual([])
  })

  it('names what is missing or not allowed', () => {
    const paths = (campaign: Parameters<typeof campaignSendIssues>[0]) => campaignSendIssues(campaign).map(issue => issue.path.join('.'))
    expect(paths({ ...ready, channels: ['push'] })).toContain('channels')
    expect(paths({ ...ready, content: { email: { subject: 'Hi', body: ' ' } } })).toContain('content.email')
    expect(paths({ ...ready, audience: { userIds: ['1'] } })).toEqual(expect.arrayContaining(['audience.listIds', 'audience']))
    expect(paths({ ...ready, important: true })).toContain('important')
    expect(paths({ ...ready, kind: 'message', audience: {} })).toContain('audience')
    expect(campaignKindChannels('newsletter')).toEqual(['email', 'sms'])
  })
})

describe('token kinds', () => {
  it('tells subscription and delivery tokens apart by their subject', async () => {
    const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify'])
    const delivery = `cmd_${'cd34'.repeat(8)}`
    const token = await signUnsubscribeToken(key, delivery)
    const subject = await verifyUnsubscribeToken(key, token)
    expect(campaignTokenKind(subject)).toBe('delivery')
    expect(campaignTokenKind(`cms_${'ab12'.repeat(8)}`)).toBe('subscription')
    expect(campaignTokenKind(`cmp_${'ab12'.repeat(8)}`)).toBeNull()
    expect(campaignTokenKind(null)).toBeNull()
    // Fits the short-link subject segment (`[\w.~-]{1,200}`).
    expect(token).toMatch(/^[\w.~-]{1,200}$/)
  })
})

describe('messages', () => {
  const links: CampaignsRecipientLinks = {
    link: url => url.startsWith('https://example.org') ? 'https://s.test/l/abc/cmd_1.sig' : undefined,
    unsubscribeUrl: 'https://site.test/subscriptions/unsubscribe?token=cmd_1.sig',
    oneClickUrl: 'https://site.test/api/campaigns/unsubscribe/cmd_1.sig',
    preferencesUrl: 'https://site.test/account/subscriptions',
    pixelUrl: null,
  }
  const content = {
    email: { subject: { da: 'Nyt', en: 'News' }, body: { da: 'Se [her](https://example.org/a) <b>x</b>', en: 'See [here](https://example.org/a) <b>x</b>' } },
    sms: { body: 'Read https://example.org/a now' },
    push: { title: 'T', body: 'B', url: 'https://example.org/a' },
  }

  it('builds the email in the recipient\'s language, escaped, with tracked links, headers and footer', () => {
    const email = buildCampaignsEmail({ kind: 'newsletter', content, locale: 'da', fallbackLocale: null, links, meta: {} })
    expect(email.subject).toBe('Nyt')
    expect(email.body).toContain('href="https://s.test/l/abc/cmd_1.sig"')
    expect(email.body).not.toContain('example.org')
    expect(email.body).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(email.body).toContain('Afmeld')
    expect(email.body).not.toContain('<img')
    expect(email.headers).toEqual(campaignUnsubscribeHeaders(links.oneClickUrl))
    expect(email.template?.name).toBe('campaigns-message')
    expect(email.text).toContain(links.unsubscribeUrl)
  })

  it('adds the open pixel only when given one', () => {
    const email = buildCampaignsEmail({ kind: 'message', content, locale: 'en', fallbackLocale: null, links: { ...links, pixelUrl: 'https://site.test/api/campaigns/o/cmd_1.sig' }, meta: {} })
    expect(email.body).toContain('<img src="https://site.test/api/campaigns/o/cmd_1.sig"')
    expect(email.template?.props?.pixelUrl).toBe('https://site.test/api/campaigns/o/cmd_1.sig')
  })

  it('builds the SMS and push with the tracked link', () => {
    expect(buildCampaignsSms({ kind: 'newsletter', content, locale: 'en', fallbackLocale: null, links, meta: {} }))
      .toBe(`Read https://s.test/l/abc/cmd_1.sig now\n\nUnsubscribe: ${links.unsubscribeUrl}`)
    expect(buildCampaignsPush({ kind: 'message', content, locale: 'en', fallbackLocale: null, links, meta: {} }))
      .toEqual({ title: 'T', body: 'B', url: 'https://s.test/l/abc/cmd_1.sig' })
  })
})
