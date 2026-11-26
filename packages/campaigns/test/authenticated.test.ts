import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import { campaignsAccess } from '../src/runtime/access'
import { campaignsApi } from '../src/runtime/utils/api'
import type { CampaignDeliveryDto, CampaignDto, CampaignListDto, CampaignMySubscriptionsDto, CampaignPreviewDto, CampaignStatsDto, CampaignSubscriberDto, CampaignSubscriptionResultDto, CampaignUserLookupDto } from '../src/types'
import { BROWSER_UA, createToken, deliveryTokenOf, emailsTo, getDeliveries, getMessages, getSubscriptions, registerUser, runDeliver, subscriptionOf, tokenOf, verifyEmail, withServerEnv } from './helpers'
import type { Session } from './helpers'

type Page<T> = { items: T[], total: number, page: number, pageSize: number }

const as = (session?: Session) => apiClient({ cookie: session?.cookie })
const bearer = (token: string) => apiClient({ bearer: token })
const anonymous = apiClient()
let counter = 0
const address = (name = 'reader') => `${name}${++counter}@reader.test`

describe('campaigns (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true, serverStartTimeout: 240_000, setupTimeout: 300_000 })

  let admin: Session
  let manager: Session
  let wild: Session
  let member: Session
  let news: CampaignListDto
  let instant: CampaignListDto
  let hidden: CampaignListDto

  beforeAll(async () => {
    admin = await registerUser('Admin', 'admin.test')
    manager = await registerUser('Manager', 'manager.test')
    wild = await registerUser('Wild', 'wild.test')
    member = await registerUser('Member')
    news = await as(admin).json<CampaignListDto>('POST', campaignsApi.admin.lists, {
      slug: 'news',
      name: { da: 'Nyheder', en: 'News' },
      channels: ['email', 'sms'],
      consentText: { da: 'Ja tak', en: 'Yes please' },
    })
    instant = await as(admin).json<CampaignListDto>('POST', campaignsApi.admin.lists, { slug: 'instant', name: 'Instant', doubleOptIn: false })
    hidden = await as(admin).json<CampaignListDto>('POST', campaignsApi.admin.lists, { slug: 'hidden', name: 'Hidden', public: false })
  })

  describe('lists (staff)', () => {
    it('creates lists with their defaults and empty counts', () => {
      expect(news).toMatchObject({ slug: 'news', channels: ['email', 'sms'], doubleOptIn: true, public: true, consentVersion: 1 })
      expect(news.id).toMatch(/^cml_[0-9a-f]{32}$/)
      expect(news.counts.email).toEqual({ active: 0, pending: 0, unsubscribed: 0 })
      expect(instant).toMatchObject({ channels: ['email'], doubleOptIn: false })
    })

    it('refuses a slug that is taken', async () => {
      await expectApiError(as(admin).fetch('POST', campaignsApi.admin.lists, { slug: 'news', name: 'Again' }), 409, 'conflict')
    })

    it('bumps the consent version when the consent text changes, and only then', async () => {
      const draft = await as(admin).json<CampaignListDto>('POST', campaignsApi.admin.lists, { slug: 'draft', name: 'Draft', consentText: 'One' })
      const renamed = await as(admin).json<CampaignListDto>('PATCH', campaignsApi.admin.list(draft.id), { name: 'Draft 2', consentText: 'One' })
      expect(renamed.consentVersion).toBe(1)
      const changed = await as(admin).json<CampaignListDto>('PATCH', campaignsApi.admin.list(draft.id), { consentText: 'Two' })
      expect(changed.consentVersion).toBe(2)
      await expectApiError(as(admin).fetch('PATCH', campaignsApi.admin.list(draft.id), { slug: 'news' }), 409, 'conflict')
      const removed = await as(admin).fetch('DELETE', campaignsApi.admin.list(draft.id))
      expect(removed.status).toBe(204)
      await expectApiError(as(admin).fetch('GET', campaignsApi.admin.list(draft.id)), 404, 'not_found')
    })
  })

  describe('signup with double opt-in', () => {
    it('sends a confirmation, which confirms on POST only, once', async () => {
      const email = address()
      const answer = await anonymous.json('POST', campaignsApi.subscribe('news'), { email: email.toUpperCase(), name: 'Kari', consent: true, locale: 'da', channels: ['email'] })
      expect(answer).toEqual({ confirm: true })

      const pending = await subscriptionOf(news.id, email)
      expect(pending?.subscription).toMatchObject({ status: 'pending', source: 'form', consentVersion: 1, channel: 'email', confirmedAt: null })
      expect(pending?.subscription.id).toMatch(/^cms_[0-9a-f]{32}$/)
      expect(pending?.subscription.ipHash).toMatch(/^[0-9a-f]{64}$/)
      expect(pending?.contact).toMatchObject({ email, name: 'Kari', locale: 'da' })

      const [mail] = await emailsTo(email)
      expect(mail?.template?.name).toBe('campaigns-confirm')
      expect(mail?.subject).toBe('Bekræft din tilmelding til Nyheder')
      const confirmUrl = mail!.template!.props.confirmUrl!
      expect(confirmUrl).toContain('/newsletter/confirm?token=')
      // Rendered from the template, with the confirmation link and the unsubscribe link in the footer.
      expect(mail!.body).toContain(confirmUrl)
      expect(mail!.body).toContain(mail!.template!.props.unsubscribeUrl!)
      const token = tokenOf(confirmUrl)
      // Only the hash is stored.
      expect(JSON.stringify(pending)).not.toContain(token)

      // A link scanner opening the page confirms nothing.
      const page = await fetch(new URL(confirmUrl).pathname + new URL(confirmUrl).search)
      expect(page.status).toBe(200)
      expect((await subscriptionOf(news.id, email))?.subscription.status).toBe('pending')

      const confirmed = await anonymous.json<CampaignSubscriptionResultDto>('POST', campaignsApi.confirm(token))
      expect(confirmed).toEqual({ list: { slug: 'news', name: { da: 'Nyheder', en: 'News' } }, channel: 'email', status: 'active' })
      const active = await subscriptionOf(news.id, email)
      expect(active?.subscription).toMatchObject({ status: 'active', confirmTokenHash: null })
      expect(active?.subscription.confirmedAt).toBeTruthy()

      await expectApiError(anonymous.fetch('POST', campaignsApi.confirm(token)), 400, 'invalid_token')
      await expectApiError(anonymous.fetch('POST', campaignsApi.confirm('not-a-token')), 400, 'invalid_token')
    })

    it('answers the same for a known and an unknown address, and does not email a subscriber again', async () => {
      const known = address('known')
      await anonymous.json('POST', campaignsApi.subscribe('news'), { email: known, consent: true })
      const [first] = await emailsTo(known)
      await anonymous.json('POST', campaignsApi.confirm(tokenOf(first!.template!.props.confirmUrl)))

      const forKnown = await anonymous.fetch('POST', campaignsApi.subscribe('news'), { email: known, consent: true })
      const forUnknown = await anonymous.fetch('POST', campaignsApi.subscribe('news'), { email: address('unknown'), consent: true })
      expect(forKnown.status).toBe(forUnknown.status)
      expect(await forKnown.text()).toBe(await forUnknown.text())
      expect(await emailsTo(known)).toHaveLength(1)
      expect((await subscriptionOf(news.id, known))?.subscription.status).toBe('active')
    })

    it('sends a pending confirmation again only after the pause', async () => {
      const email = address('twice')
      await anonymous.json('POST', campaignsApi.subscribe('news'), { email, consent: true })
      await anonymous.json('POST', campaignsApi.subscribe('news'), { email, consent: true })
      expect(await emailsTo(email)).toHaveLength(1)
      await withServerEnv('NUXT_CAMPAIGNS_RESEND_AFTER_SECONDS', '0', async () => {
        await anonymous.json('POST', campaignsApi.subscribe('news'), { email, consent: true })
      })
      const mails = await emailsTo(email)
      expect(mails).toHaveLength(2)
      // The first link stopped working when the second went out.
      await expectApiError(anonymous.fetch('POST', campaignsApi.confirm(tokenOf(mails[0]!.template!.props.confirmUrl))), 400, 'invalid_token')
      await anonymous.json('POST', campaignsApi.confirm(tokenOf(mails[1]!.template!.props.confirmUrl)))
    })

    it('confirms by SMS for a phone number', async () => {
      const answer = await anonymous.json('POST', campaignsApi.subscribe('news'), { phone: '+45 20 30 40 50', consent: true, locale: 'en' })
      expect(answer).toEqual({ confirm: true })
      const text = (await getMessages()).texts.find(entry => entry.to === '+4520304050')
      expect(text?.body).toMatch(/^Confirm your subscription to News: http/)
      const url = text!.body.split(': ')[1]!
      const confirmed = await anonymous.json<CampaignSubscriptionResultDto>('POST', campaignsApi.confirm(tokenOf(url)))
      expect(confirmed).toMatchObject({ channel: 'sms', status: 'active' })
    })

    it('refuses no consent, a missing address and a channel the list does not have', async () => {
      await expectApiError(anonymous.fetch('POST', campaignsApi.subscribe('news'), { email: address() }), 400)
      await expectApiError(anonymous.fetch('POST', campaignsApi.subscribe('news'), { consent: true }), 400)
      await expectApiError(anonymous.fetch('POST', campaignsApi.subscribe('instant'), { phone: '+4511223344', consent: true }), 400, 'bad_request')
    })
  })

  describe('signup without double opt-in, and other cases', () => {
    it('activates at once and sends nothing', async () => {
      const email = address('instant')
      expect(await anonymous.json('POST', campaignsApi.subscribe('instant'), { email, consent: true })).toEqual({ confirm: false })
      const row = await subscriptionOf(instant.id, email)
      expect(row?.subscription).toMatchObject({ status: 'active', source: 'form' })
      expect(row?.subscription.confirmedAt).toBeTruthy()
      expect(await emailsTo(email)).toHaveLength(0)
    })

    it('does not show or sign up for a list that is not public', async () => {
      await expectApiError(anonymous.fetch('GET', campaignsApi.list('hidden')), 404, 'not_found')
      await expectApiError(anonymous.fetch('POST', campaignsApi.subscribe('hidden'), { email: address(), consent: true }), 404, 'not_found')
      const list = await anonymous.json<Record<string, unknown>>('GET', campaignsApi.list('news'))
      expect(list).toMatchObject({ slug: 'news', consentText: { da: 'Ja tak', en: 'Yes please' }, consentVersion: 1 })
      expect(list).not.toHaveProperty('counts')
    })

    it('answers a filled honeypot as usual and stores nothing', async () => {
      const email = address('bot')
      expect(await anonymous.json('POST', campaignsApi.subscribe('news'), { email, consent: true, website: 'https://spam.test' })).toEqual({ confirm: true })
      expect(await subscriptionOf(news.id, email)).toBeUndefined()
      expect(await emailsTo(email)).toHaveLength(0)
    })

    it('redirects a plain HTML form post to the confirm page', async () => {
      const email = address('form')
      const response = await fetch(campaignsApi.subscribe('news'), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email, name: 'Ola', consent: 'on', website: '' }).toString(),
        redirect: 'manual',
      })
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toMatch(/\/newsletter\/confirm\?subscribed=news&confirm=1$/)
      expect((await subscriptionOf(news.id, email))?.subscription.status).toBe('pending')
    })

    it('allows CORS for the configured origins only', async () => {
      const preflight = await fetch(campaignsApi.subscribe('news'), { method: 'OPTIONS', headers: { 'origin': 'https://partner.test', 'access-control-request-method': 'POST' } })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-origin')).toBe('https://partner.test')
      expect(preflight.headers.get('access-control-allow-credentials')).toBeNull()
      const other = await fetch(campaignsApi.subscribe('news'), { method: 'POST', headers: { 'origin': 'https://evil.test', 'content-type': 'application/json' }, body: JSON.stringify({ email: address(), consent: true }) })
      expect(other.headers.get('access-control-allow-origin')).toBeNull()
    })

    it('rate limits signups per client and list', async () => {
      await withServerEnv('NUXT_CAMPAIGNS_RATE_LIMIT', '1', async () => {
        const list = await as(admin).json<CampaignListDto>('POST', campaignsApi.admin.lists, { slug: 'limited', name: 'Limited' })
        await anonymous.json('POST', campaignsApi.subscribe(list.slug), { email: address(), consent: true })
        await expectApiError(anonymous.fetch('POST', campaignsApi.subscribe(list.slug), { email: address(), consent: true }), 429, 'rate_limited')
      })
    })
  })

  describe('unsubscribe', () => {
    it('unsubscribes with the signed token on POST, never on GET', async () => {
      const email = address('leaver')
      await anonymous.json('POST', campaignsApi.subscribe('news'), { email, consent: true })
      const [mail] = await emailsTo(email)
      await anonymous.json('POST', campaignsApi.confirm(tokenOf(mail!.template!.props.confirmUrl)))
      const token = tokenOf(mail!.template!.props.unsubscribeUrl)
      const subscription = await subscriptionOf(news.id, email)
      expect(token.startsWith(`${subscription!.subscription.id}.`)).toBe(true)

      // A GET of the API route or the page changes nothing.
      const get = await fetch(campaignsApi.unsubscribe(token))
      expect(get.status).toBeGreaterThanOrEqual(400)
      const page = await fetch(`/newsletter/unsubscribe?token=${encodeURIComponent(token)}`)
      expect(page.status).toBe(200)
      expect((await subscriptionOf(news.id, email))?.subscription.status).toBe('active')

      // RFC 8058: the mail provider posts `List-Unsubscribe=One-Click` as a form.
      const response = await fetch(campaignsApi.unsubscribe(token), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ list: { slug: 'news' }, channel: 'email', status: 'unsubscribed' })
      const row = await subscriptionOf(news.id, email)
      expect(row?.subscription.status).toBe('unsubscribed')
      expect(row?.subscription.unsubscribedAt).toBeTruthy()
      // Again: no change, no error.
      expect(await anonymous.json('POST', campaignsApi.unsubscribe(token))).toMatchObject({ status: 'unsubscribed' })
    })

    it('refuses a token it did not sign', async () => {
      const [row] = await getSubscriptions()
      const id = row!.subscription.id as string
      await expectApiError(anonymous.fetch('POST', campaignsApi.unsubscribe(`${id}.${'A'.repeat(43)}`)), 400, 'invalid_token')
      await expectApiError(anonymous.fetch('POST', campaignsApi.unsubscribe('garbage')), 400, 'invalid_token')
    })

    it('a pending subscription unsubscribed from the confirmation cannot be confirmed any more', async () => {
      const email = address('notme')
      await anonymous.json('POST', campaignsApi.subscribe('news'), { email, consent: true })
      const [mail] = await emailsTo(email)
      await anonymous.json('POST', campaignsApi.unsubscribe(tokenOf(mail!.template!.props.unsubscribeUrl)))
      await expectApiError(anonymous.fetch('POST', campaignsApi.confirm(tokenOf(mail!.template!.props.confirmUrl))), 400, 'invalid_token')
    })
  })

  describe('the signed-in user\'s newsletters', () => {
    it('needs a signed-in user', async () => {
      await expectApiError(anonymous.fetch('GET', campaignsApi.me.subscriptions), 401)
    })

    it('links the contact by verified email only', async () => {
      const user = await registerUser('Reader')
      await anonymous.json('POST', campaignsApi.subscribe('news'), { email: user.email, consent: true })
      const [mail] = await emailsTo(user.email)
      await anonymous.json('POST', campaignsApi.confirm(tokenOf(mail!.template!.props.confirmUrl)))

      const before = await as(user).json<CampaignMySubscriptionsDto>('GET', campaignsApi.me.subscriptions)
      expect(before.emailVerified).toBe(false)
      expect(before.lists.find(list => list.slug === 'news')?.subscriptions).toEqual({})
      expect(before.lists.map(list => list.slug)).not.toContain('hidden')

      await verifyEmail(user.id)
      const after = await as(user).json<CampaignMySubscriptionsDto>('GET', campaignsApi.me.subscriptions)
      expect(after.emailVerified).toBe(true)
      expect(after.lists.find(list => list.slug === 'news')?.subscriptions).toEqual({ email: 'active' })
      expect((await subscriptionOf(news.id, user.email))?.contact.userId).toBe(user.id)

      // Off, then on again: active at once for a verified address, without an email.
      const off = await as(user).json<CampaignMySubscriptionsDto>('PATCH', campaignsApi.me.subscriptions, { lists: { [news.id]: { email: false } } })
      expect(off.lists.find(list => list.slug === 'news')?.subscriptions).toEqual({ email: 'unsubscribed' })
      const on = await as(user).json<CampaignMySubscriptionsDto>('PATCH', campaignsApi.me.subscriptions, { lists: { [news.id]: { email: true } } })
      expect(on.lists.find(list => list.slug === 'news')?.subscriptions).toEqual({ email: 'active' })
      expect((await subscriptionOf(news.id, user.email))?.subscription.source).toBe('account')
      expect(await emailsTo(user.email)).toHaveLength(1)
    })

    it('asks an unverified address to confirm first', async () => {
      const user = await registerUser('Fresh')
      const result = await as(user).json<CampaignMySubscriptionsDto>('PATCH', campaignsApi.me.subscriptions, { lists: { [news.id]: { email: true } } })
      expect(result.lists.find(list => list.slug === 'news')?.subscriptions).toEqual({ email: 'pending' })
      const [mail] = await emailsTo(user.email)
      expect(mail?.template?.name).toBe('campaigns-confirm')
    })

    it('refuses SMS signups, lists it may not see and unknown lists', async () => {
      await expectApiError(as(member).fetch('PATCH', campaignsApi.me.subscriptions, { lists: { [news.id]: { sms: true } } }), 400, 'validation_failed')
      await expectApiError(as(member).fetch('PATCH', campaignsApi.me.subscriptions, { lists: { [hidden.id]: { email: true } } }), 400, 'validation_failed')
      await expectApiError(as(member).fetch('PATCH', campaignsApi.me.subscriptions, { lists: { cml_unknown: { email: true } } }), 400, 'validation_failed')
    })

    it('works with a token given `campaigns:subscriptions`, and not without', async () => {
      const allowed = await createToken(member.cookie, [campaignsAccess.permissions.subscriptions])
      const mine = await bearer(allowed).json<CampaignMySubscriptionsDto>('GET', campaignsApi.me.subscriptions)
      expect(mine.lists.length).toBeGreaterThan(0)
      const other = await createToken(admin.cookie, [campaignsAccess.permissions.manage])
      await expectApiError(bearer(other).fetch('GET', campaignsApi.me.subscriptions), 403, 'insufficient_scope')
    })
  })

  describe('access to the staff routes', () => {
    it('needs a session or token with `campaigns:manage`', async () => {
      await expectApiError(anonymous.fetch('GET', campaignsApi.admin.lists), 401)
      await expectApiError(as(member).fetch('GET', campaignsApi.admin.lists), 403, 'forbidden')
      await expectApiError(as(member).fetch('POST', campaignsApi.admin.lists, { slug: 'nope', name: 'Nope' }), 403, 'forbidden')
      await expectApiError(as(member).fetch('GET', campaignsApi.admin.subscribers(news.id)), 403, 'forbidden')
      const lists = await as(manager).json<CampaignListDto[]>('GET', campaignsApi.admin.lists)
      expect(lists.map(list => list.slug)).toEqual(expect.arrayContaining(['news', 'instant', 'hidden']))
      expect(lists.find(list => list.slug === 'news')!.counts.email.active).toBeGreaterThan(0)
    })

    it('shows addresses only with `campaigns:pii`, which `campaigns:*` does not reach', async () => {
      const withPii = await as(admin).json<Page<CampaignSubscriberDto>>('GET', campaignsApi.admin.subscribers(news.id))
      expect(withPii.total).toBeGreaterThan(0)
      expect(withPii.items.some(item => item.contact.email?.endsWith('@reader.test'))).toBe(true)

      for (const session of [manager, wild]) {
        const page = await as(session).json<Page<CampaignSubscriberDto>>('GET', campaignsApi.admin.subscribers(news.id))
        expect(page.total).toBe(withPii.total)
        for (const item of page.items) {
          expect(item.contact).not.toHaveProperty('email')
          expect(item.contact).not.toHaveProperty('phone')
        }
      }
      // Without the address, a search cannot find it either.
      const search = encodeURIComponent('reader.test')
      expect((await as(manager).json<Page<CampaignSubscriberDto>>('GET', `${campaignsApi.admin.subscribers(news.id)}?q=${search}`)).total).toBe(0)
      expect((await as(admin).json<Page<CampaignSubscriberDto>>('GET', `${campaignsApi.admin.subscribers(news.id)}?q=${search}`)).total).toBeGreaterThan(0)
    })

    it('filters subscribers by status', async () => {
      const page = await as(admin).json<Page<CampaignSubscriberDto>>('GET', `${campaignsApi.admin.subscribers(news.id)}?status=unsubscribed`)
      expect(page.total).toBeGreaterThan(0)
      expect(page.items.every(item => item.status === 'unsubscribed')).toBe(true)
    })

    it('takes a token with the permission, without the addresses unless it has `campaigns:pii` too', async () => {
      const manage = await createToken(admin.cookie, [campaignsAccess.permissions.manage])
      expect((await bearer(manage).json<CampaignListDto[]>('GET', campaignsApi.admin.lists)).length).toBeGreaterThan(0)
      const page = await bearer(manage).json<Page<CampaignSubscriberDto>>('GET', campaignsApi.admin.subscribers(news.id))
      expect(page.items[0]!.contact).not.toHaveProperty('email')
      const pii = await createToken(admin.cookie, [campaignsAccess.permissions.manage, campaignsAccess.permissions.pii])
      const full = await bearer(pii).json<Page<CampaignSubscriberDto>>('GET', campaignsApi.admin.subscribers(news.id))
      expect(full.items.some(item => typeof item.contact.email === 'string' || typeof item.contact.phone === 'string')).toBe(true)

      const noScope = await createToken(admin.cookie, [campaignsAccess.permissions.subscriptions])
      await expectApiError(bearer(noScope).fetch('GET', campaignsApi.admin.lists), 403, 'insufficient_scope')
    })

    it('answers 401/403 before 404', async () => {
      await expectApiError(anonymous.fetch('GET', campaignsApi.admin.list('cml_missing')), 401)
      await expectApiError(as(member).fetch('GET', campaignsApi.admin.list('cml_missing')), 403)
      await expectApiError(as(admin).fetch('GET', campaignsApi.admin.list('cml_missing')), 404, 'not_found')
    })

    it('renders the staff, account and public pages, and the signup component', async () => {
      for (const path of ['/admin/campaigns/lists', `/admin/campaigns/lists/${news.id}`, '/account/newsletters', '/signup', '/newsletter/confirm?subscribed=news&confirm=1']) {
        const response = await fetch(path, { headers: { cookie: admin.cookie } })
        const html = await response.text()
        expect(response.status, `${path}: ${html.slice(0, 3000)}`).toBe(200)
        expect(html, path).toContain('<div')
      }
    })
  })

  describe('campaigns', () => {
    let sender: Session
    let weekly: CampaignListDto
    const readerA = `${'weekly-a'}@reader.test`
    const readerB = `${'weekly-b'}@reader.test`

    /** Runs the deliver task until the campaign is sent (a pass also starts right after "send now"). */
    async function deliverAll(id: string): Promise<CampaignStatsDto> {
      for (let run = 0; run < 10; run++) {
        await runDeliver()
        const stats = await as(admin).json<CampaignStatsDto>('GET', campaignsApi.admin.stats(id))
        if (stats.status === 'sent') return stats
      }
      throw new Error(`campaign ${id} was not sent`)
    }

    const newsletterInput = (extra: Record<string, unknown> = {}) => ({
      kind: 'newsletter',
      name: 'Weekly issue',
      channels: ['email'],
      audience: { listIds: [weekly.id] },
      content: {
        email: {
          subject: { da: 'Ugens nyt', en: 'This week' },
          body: { en: 'Read [the story](https://example.org/story?x=1) or jump to [the top](#top), or write to [us](mailto:news@example.org).' },
        },
      },
      ...extra,
    })

    it('sets up a list with two subscribers and a sender', async () => {
      sender = await registerUser('Sender', 'sender.test')
      weekly = await as(admin).json<CampaignListDto>('POST', campaignsApi.admin.lists, { slug: 'weekly', name: 'Weekly', doubleOptIn: false })
      for (const email of [readerA, readerB]) await anonymous.json('POST', campaignsApi.subscribe('weekly'), { email, consent: true, locale: 'en' })
      expect((await subscriptionOf(weekly.id, readerB))?.subscription.status).toBe('active')
    })

    it('creates a draft, previews its audience and refuses changes once sent', async () => {
      const draft = await as(admin).json<CampaignDto>('POST', campaignsApi.admin.campaigns, newsletterInput({ name: 'Draft only' }))
      expect(draft).toMatchObject({ status: 'draft', kind: 'newsletter', trackClicks: true, trackOpens: false, important: false })
      expect(draft.id).toMatch(/^cmp_[0-9a-f]{32}$/)
      expect(await as(admin).json<CampaignPreviewDto>('GET', campaignsApi.admin.preview(draft.id))).toEqual({ recipients: 2, channels: { email: 2 } })
      const renamed = await as(admin).json<CampaignDto>('PATCH', campaignsApi.admin.campaign(draft.id), { name: 'Renamed' })
      expect(renamed.name).toBe('Renamed')
      // Not ready: push on a newsletter.
      await expectApiError(as(admin).fetch('PATCH', campaignsApi.admin.campaign(draft.id), { channels: ['push'] }).then(async (response) => {
        expect(response.status).toBe(200)
        return as(admin).fetch('POST', campaignsApi.admin.send(draft.id))
      }), 400, 'validation_failed')
      expect((await as(admin).fetch('DELETE', campaignsApi.admin.campaign(draft.id))).status).toBe(204)
      await expectApiError(as(admin).fetch('GET', campaignsApi.admin.campaign(draft.id)), 404, 'not_found')
      await expectApiError(as(admin).fetch('POST', campaignsApi.admin.campaigns, newsletterInput({ audience: { listIds: ['cml_missing'] } })), 400, 'validation_failed')
    })

    it('sends a newsletter with tracked links, unsubscribe headers and footer; clicks count, opens only with trackOpens', async () => {
      const campaign = await as(admin).json<CampaignDto>('POST', campaignsApi.admin.campaigns, newsletterInput())
      const sent = await as(admin).json<CampaignDto>('POST', campaignsApi.admin.send(campaign.id))
      expect(['scheduled', 'sending', 'sent']).toContain(sent.status)
      await expectApiError(as(admin).fetch('PATCH', campaignsApi.admin.campaign(campaign.id), { name: 'Late' }), 409, 'not_draft')
      const stats = await deliverAll(campaign.id)
      expect(stats.counts.email).toMatchObject({ total: 2, sent: 2, skipped: 0, failed: 0 })
      expect(stats.links).toHaveLength(1)
      expect(stats.links[0]).toMatchObject({ url: 'https://example.org/story?x=1', clicks: 0 })

      const [mail] = await emailsTo(readerA)
      expect(mail?.template?.name).toBe('campaigns-message')
      expect(mail?.subject).toBe('This week')
      // The link is the short link with the delivery token; anchors and mailto stay as written.
      const link = mail!.body.match(/href="([^"]*\/l\/[^"]+)"/)?.[1]
      expect(link, mail!.body).toBeTruthy()
      expect(mail!.body).not.toContain('example.org/story')
      expect(mail!.text).toContain('[the top](#top)')
      expect(mail!.body).toContain('href="mailto:news@example.org"')
      const token = deliveryTokenOf(link!)
      expect(token).toMatch(/^cmd_[0-9a-f]{32}\.[\w-]{43}$/)
      expect(mail!.headers).toEqual({
        'List-Unsubscribe': expect.stringMatching(new RegExp(`^<http.*/api/campaigns/unsubscribe/${token.replace('.', '\\.')}>$`)),
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      })
      expect(mail!.template!.props.unsubscribeUrl).toContain(`/newsletter/unsubscribe?token=${encodeURIComponent(token)}`)
      expect(mail!.body).toContain(mail!.template!.props.unsubscribeUrl!.replace(/&/g, '&amp;'))
      expect(mail!.body).toContain('/account/newsletters')
      expect(mail!.body).not.toContain('/api/campaigns/o/')

      // Following the link redirects to the stored URL and counts on the delivery.
      const redirect = await fetch(new URL(link!).pathname, { redirect: 'manual', headers: { 'user-agent': BROWSER_UA } })
      expect(redirect.status).toBe(302)
      expect(redirect.headers.get('location')).toBe('https://example.org/story?x=1')
      const { deliveries, clicks } = await getDeliveries()
      const delivery = deliveries.find(row => row.id === token.split('.')[0])!
      expect(delivery).toMatchObject({ status: 'sent', clicks: 1 })
      expect(delivery.clickedAt).toBeTruthy()
      expect(clicks.filter(row => row.deliveryId === delivery.id)).toHaveLength(1)
      const after = await as(admin).json<CampaignStatsDto>('GET', campaignsApi.admin.stats(campaign.id))
      expect(after.links[0]).toMatchObject({ clicks: 1, recipients: 1 })
      expect(after.counts.email).toMatchObject({ clicked: 1, clicks: 1 })

      // A forged token is not attributed.
      await fetch(`${new URL(link!).pathname.split('/').slice(0, -1).join('/')}/${delivery.id}.${'A'.repeat(43)}`, { redirect: 'manual', headers: { 'user-agent': BROWSER_UA } })
      expect((await getDeliveries()).deliveries.find(row => row.id === delivery.id)?.clicks).toBe(1)

      // Without trackOpens the pixel answers, and counts nothing.
      const pixel = await fetch(campaignsApi.open(token))
      expect(pixel.status).toBe(200)
      expect(pixel.headers.get('content-type')).toBe('image/gif')
      expect((await getDeliveries()).deliveries.find(row => row.id === delivery.id)?.openedAt).toBeNull()
    })

    it('counts an open with trackOpens, and a one-click unsubscribe with the delivery token stops the next send', async () => {
      const campaign = await as(admin).json<CampaignDto>('POST', campaignsApi.admin.campaigns, newsletterInput({ name: 'Opens', trackOpens: true }))
      await as(admin).json('POST', campaignsApi.admin.send(campaign.id))
      await deliverAll(campaign.id)
      const mail = (await emailsTo(readerA)).at(-1)!
      const pixelUrl = mail.template!.props.pixelUrl!
      expect(pixelUrl).toContain('/api/campaigns/o/cmd_')
      expect(mail.body).toContain(`<img src="${pixelUrl}"`)
      await fetch(new URL(pixelUrl).pathname)
      const stats = await as(admin).json<CampaignStatsDto>('GET', campaignsApi.admin.stats(campaign.id))
      expect(stats.counts.email?.opened).toBe(1)

      // RFC 8058: the mail app posts to the List-Unsubscribe URL.
      const oneClick = mail.headers!['List-Unsubscribe']!.slice(1, -1)
      const response = await fetch(new URL(oneClick).pathname, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ list: { slug: 'weekly' }, channel: 'email', status: 'unsubscribed' })
      expect((await subscriptionOf(weekly.id, readerA))?.subscription.status).toBe('unsubscribed')

      const before = (await emailsTo(readerA)).length
      const next = await as(admin).json<CampaignDto>('POST', campaignsApi.admin.campaigns, newsletterInput({ name: 'Next' }))
      await as(admin).json('POST', campaignsApi.admin.send(next.id))
      const nextStats = await deliverAll(next.id)
      expect(nextStats.counts.email).toMatchObject({ total: 1, sent: 1 })
      expect(await emailsTo(readerA)).toHaveLength(before)
    })

    it('sends a message to users following their `campaigns.message` choices, unless important', async () => {
      const keen = await registerUser('Keen')
      const quiet = await registerUser('Quiet')
      await as(quiet).json('PATCH', '/api/preferences/notifications', { topics: { 'campaigns.message': { email: false } } })
      const message = {
        kind: 'message',
        name: 'Heads up',
        channels: ['email'],
        audience: { userIds: [String(keen.id), String(quiet.id)] },
        content: { email: { subject: 'Heads up', body: 'See https://example.org/info.' } },
      }
      const plain = await as(admin).json<CampaignDto>('POST', campaignsApi.admin.campaigns, message)
      expect(await as(admin).json<CampaignPreviewDto>('GET', campaignsApi.admin.preview(plain.id))).toEqual({ recipients: 2, channels: { email: 2 } })
      await as(admin).json('POST', campaignsApi.admin.send(plain.id))
      const stats = await deliverAll(plain.id)
      expect(stats.counts.email).toMatchObject({ total: 2, sent: 1, skipped: 1 })
      expect(await emailsTo(quiet.email)).toHaveLength(0)
      const [mail] = await emailsTo(keen.email)
      expect(mail?.template?.name).toBe('campaigns-message')
      expect(mail?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
      expect(mail!.body).toContain('/account/notifications')
      const { deliveries } = await getDeliveries()
      expect(deliveries.find(row => row.campaignId === plain.id && row.userId === quiet.id)).toMatchObject({ status: 'skipped', skipReason: 'disabled' })

      // Important: only with `campaigns:send-important`, and it reaches the user who turned email off.
      await expectApiError(as(sender).fetch('POST', campaignsApi.admin.campaigns, { ...message, important: true }), 403, 'forbidden')
      const important = await as(admin).json<CampaignDto>('POST', campaignsApi.admin.campaigns, { ...message, name: 'Important', important: true })
      await expectApiError(as(sender).fetch('POST', campaignsApi.admin.send(important.id)), 403, 'forbidden')
      await expectApiError(as(admin).fetch('POST', campaignsApi.admin.campaigns, newsletterInput({ important: true })).then(async (response) => {
        const created = await response.json() as CampaignDto
        return as(admin).fetch('POST', campaignsApi.admin.send(created.id))
      }), 400, 'validation_failed')
      await as(admin).json('POST', campaignsApi.admin.send(important.id))
      await deliverAll(important.id)
      expect(await emailsTo(quiet.email)).toHaveLength(1)

      // A non-important message can still be sent by `sender`; unsubscribing with its token turns the channel off.
      const again = await as(sender).json<CampaignDto>('POST', campaignsApi.admin.campaigns, { ...message, name: 'Again' })
      await as(sender).json('POST', campaignsApi.admin.send(again.id))
      await deliverAll(again.id)
      const latest = (await emailsTo(keen.email)).at(-1)!
      const token = deliveryTokenOf(latest.template!.props.unsubscribeUrl!)
      expect(await anonymous.json('POST', campaignsApi.unsubscribe(token))).toEqual({ topic: 'campaigns.message', channel: 'email', status: 'unsubscribed' })
      const choices = await as(keen).json<{ topics: Array<{ id: string, settings: Record<string, boolean> }> }>('GET', '/api/preferences/notifications')
      expect(choices.topics.find(topic => topic.id === 'campaigns.message')?.settings.email).toBe(false)
    })

    it('refuses a message whose audience lists nobody', async () => {
      const draft = await as(admin).json<CampaignDto>('POST', campaignsApi.admin.campaigns, { kind: 'message', name: 'Nobody', audience: { userIds: ['nobody'] }, content: { email: { subject: 'S', body: 'B' } } })
      await expectApiError(as(admin).fetch('POST', campaignsApi.admin.send(draft.id)), 400, 'audience_not_resolved')
    })

    it('schedules and cancels', async () => {
      const campaign = await as(admin).json<CampaignDto>('POST', campaignsApi.admin.campaigns, newsletterInput({ name: 'Later' }))
      await expectApiError(as(admin).fetch('POST', campaignsApi.admin.schedule(campaign.id), { scheduledAt: '2000-01-01T00:00:00Z' }), 400)
      const later = new Date(Date.now() + 3_600_000).toISOString()
      const scheduled = await as(admin).json<CampaignDto>('POST', campaignsApi.admin.schedule(campaign.id), { scheduledAt: later })
      expect(scheduled.status).toBe('scheduled')
      await runDeliver()
      expect((await as(admin).json<CampaignDto>('GET', campaignsApi.admin.campaign(campaign.id))).status).toBe('scheduled')
      const cancelled = await as(admin).json<CampaignDto>('POST', campaignsApi.admin.cancel(campaign.id))
      expect(cancelled.status).toBe('cancelled')
      await expectApiError(as(admin).fetch('POST', campaignsApi.admin.cancel(campaign.id)), 409, 'not_cancellable')
      await expectApiError(as(admin).fetch('DELETE', campaignsApi.admin.campaign(campaign.id)), 409, 'not_draft')
    })

    it('guards the campaign routes: cookie, token, scope, and `campaigns:pii` for deliveries', async () => {
      const [first] = (await as(admin).json<{ items: CampaignDto[] }>('GET', `${campaignsApi.admin.campaigns}?status=sent&kind=newsletter`)).items
      expect(first).toBeTruthy()
      await expectApiError(anonymous.fetch('GET', campaignsApi.admin.campaigns), 401)
      await expectApiError(as(member).fetch('GET', campaignsApi.admin.campaigns), 403, 'forbidden')
      await expectApiError(anonymous.fetch('GET', campaignsApi.admin.campaign('cmp_missing')), 401)
      await expectApiError(as(member).fetch('GET', campaignsApi.admin.campaign('cmp_missing')), 403)
      await expectApiError(as(admin).fetch('GET', campaignsApi.admin.campaign('cmp_missing')), 404, 'not_found')

      // `campaigns:manage` sees campaigns and stats, but does not send.
      expect((await as(manager).json<CampaignStatsDto>('GET', campaignsApi.admin.stats(first!.id))).status).toBe('sent')
      const draft = await as(manager).json<CampaignDto>('POST', campaignsApi.admin.campaigns, newsletterInput({ name: 'Manager draft' }))
      await expectApiError(as(manager).fetch('POST', campaignsApi.admin.send(draft.id)), 403, 'forbidden')

      // Deliveries name recipients: only with `campaigns:pii`, which `campaigns:*` never reaches.
      const withPii = await as(admin).json<{ items: CampaignDeliveryDto[], total: number }>('GET', campaignsApi.admin.deliveries(first!.id))
      expect(withPii.total).toBeGreaterThan(0)
      expect(withPii.items.some(item => item.recipient.address?.endsWith('@reader.test'))).toBe(true)
      await expectApiError(as(wild).fetch('GET', campaignsApi.admin.deliveries(first!.id)), 403, 'forbidden')
      await expectApiError(as(manager).fetch('GET', campaignsApi.admin.deliveries(first!.id)), 403, 'forbidden')

      const manage = await createToken(admin.cookie, [campaignsAccess.permissions.manage])
      expect((await bearer(manage).json<{ total: number }>('GET', campaignsApi.admin.campaigns)).total).toBeGreaterThan(0)
      await expectApiError(bearer(manage).fetch('GET', campaignsApi.admin.deliveries(first!.id)), 403, 'insufficient_scope')
      const pii = await createToken(admin.cookie, [campaignsAccess.permissions.manage, campaignsAccess.permissions.pii])
      expect((await bearer(pii).json<{ total: number }>('GET', campaignsApi.admin.deliveries(first!.id))).total).toBe(withPii.total)
      const noScope = await createToken(admin.cookie, [campaignsAccess.permissions.subscriptions])
      await expectApiError(bearer(noScope).fetch('GET', campaignsApi.admin.campaigns), 403, 'insufficient_scope')
    })

    it('counts skipped deliveries by reason', async () => {
      const { items } = await as(admin).json<{ items: CampaignDto[] }>('GET', `${campaignsApi.admin.campaigns}?status=sent&kind=message`)
      const all = await Promise.all(items.map(item => as(admin).json<CampaignStatsDto>('GET', campaignsApi.admin.stats(item.id))))
      const stats = all.find(entry => (entry.counts.email?.skipped ?? 0) > 0)!
      // The plain message skipped the user who turned email off for messages.
      expect(stats.skipReasons.disabled).toBeGreaterThanOrEqual(1)
      for (const entry of all) {
        const skipped = Object.values(entry.counts).reduce((sum, counts) => sum + (counts?.skipped ?? 0), 0)
        expect(Object.values(entry.skipReasons).reduce<number>((sum, count) => sum + (count ?? 0), 0)).toBe(skipped)
      }
    })

    it('looks up people for the message form: names for `campaigns:manage`, emails with `campaigns:pii`', async () => {
      const byName = await as(manager).json<CampaignUserLookupDto[]>('GET', `${campaignsApi.admin.users}?q=Sender`)
      expect(byName.map(user => user.id)).toContain(sender.id)
      expect(byName.every(user => !('email' in user))).toBe(true)
      // Without `campaigns:pii` an email address finds nobody.
      expect(await as(manager).json<CampaignUserLookupDto[]>('GET', `${campaignsApi.admin.users}?q=${encodeURIComponent(sender.email)}`)).toEqual([])
      const withPii = await as(admin).json<CampaignUserLookupDto[]>('GET', `${campaignsApi.admin.users}?q=${encodeURIComponent(sender.email)}`)
      expect(withPii).toEqual([expect.objectContaining({ id: sender.id, email: sender.email })])
      const byId = await as(manager).json<CampaignUserLookupDto[]>('GET', `${campaignsApi.admin.users}?ids=${sender.id},${admin.id},x`)
      expect(byId.map(user => user.id).sort()).toEqual([admin.id, sender.id].sort())
      await expectApiError(as(member).fetch('GET', `${campaignsApi.admin.users}?q=Sender`), 403, 'forbidden')
    })

    it('renders the campaign pages, with the send actions and the recipients only for those allowed', async () => {
      const [sent] = (await as(admin).json<{ items: CampaignDto[] }>('GET', `${campaignsApi.admin.campaigns}?status=sent&kind=newsletter`)).items
      const draft = await as(admin).json<CampaignDto>('POST', campaignsApi.admin.campaigns, newsletterInput({ name: 'Page draft' }))
      const message = await as(admin).json<CampaignDto>('POST', campaignsApi.admin.campaigns, { kind: 'message', name: 'Page message', audience: { userIds: [String(sender.id)] }, channels: ['email', 'push'] })
      const render = async (session: Session, path: string) => {
        const response = await fetch(path, { headers: { cookie: session.cookie } })
        const html = await response.text()
        expect(response.status, `${path}: ${html.slice(0, 3000)}`).toBe(200)
        return html
      }
      const list = await render(admin, '/admin/campaigns')
      expect(list).toContain('data-campaigns-table')
      expect(list).toContain('Page draft')
      await render(admin, '/admin/campaigns/lists')
      await render(admin, `/admin/campaigns/${message.id}`)
      expect(await render(admin, '/admin/campaigns/cmp_missing')).toContain('Campaign not found')

      // Deliveries name recipients: `campaigns:pii` only, which `campaigns:*` never reaches.
      expect(await render(admin, `/admin/campaigns/${sent!.id}`)).toContain('data-campaign-deliveries')
      expect(await render(wild, `/admin/campaigns/${sent!.id}`)).not.toContain('data-campaign-deliveries')
      expect(await render(manager, `/admin/campaigns/${sent!.id}`)).not.toContain('data-campaign-deliveries')

      // Send and schedule need `campaigns:send`; a draft that is ready shows no list of what is missing.
      const ready = await render(admin, `/admin/campaigns/${draft.id}`)
      expect(ready).toContain('data-campaign-send')
      expect(ready).toContain('data-campaign-schedule')
      expect(ready).not.toContain('data-campaign-issues')
      expect(await render(sender, `/admin/campaigns/${draft.id}`)).toContain('data-campaign-send')
      expect(await render(manager, `/admin/campaigns/${draft.id}`)).not.toContain('data-campaign-send')
      // The message has no texts yet: it lists what is missing.
      expect(await render(admin, `/admin/campaigns/${message.id}`)).toContain('data-campaign-issues')
      await as(admin).fetch('DELETE', campaignsApi.admin.campaign(draft.id))
      await as(admin).fetch('DELETE', campaignsApi.admin.campaign(message.id))
    })

    it('prunes the per-recipient rows after `retentionDays`, keeping the counts', async () => {
      const [sent] = (await as(admin).json<{ items: CampaignDto[] }>('GET', `${campaignsApi.admin.campaigns}?status=sent&kind=newsletter`)).items
      const before = await as(admin).json<CampaignStatsDto>('GET', campaignsApi.admin.stats(sent!.id))
      await $fetch('/api/test/retention', { method: 'POST', body: { now: new Date(Date.now() + 400 * 86_400_000).toISOString() } })
      expect((await getDeliveries()).deliveries.filter(row => row.campaignId === sent!.id)).toHaveLength(0)
      const after = await as(admin).json<CampaignStatsDto>('GET', campaignsApi.admin.stats(sent!.id))
      expect(after.counts).toEqual(before.counts)
    })
  })
})
