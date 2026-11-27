import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError, fixtureSqlite, reindexOf, runSearchReindex } from '@frigear-nu/module-kit/testing'
import { formsApi } from '@frigear-nu/forms/api'
import { inboxApi } from '../src/runtime/utils/api'
import { backdate, createToken, getEmails, getHooks, getSent, makeLead, postEmail, postMeta, registerUser, runRetention, withServerEnv } from './helpers'
import type { Session } from './helpers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON responses
type Json = Record<string, any>

const as = (session?: Session) => apiClient({ cookie: session?.cookie })
const bearer = (token: string) => apiClient({ bearer: token })
let counter = 0

const email = (overrides: Json = {}) => ({
  messageId: `<m${++counter}@mail.example>`,
  from: { email: `kari${counter}@example.org`, name: 'Kari Nordmann' },
  to: 'support@inbox.test',
  subject: 'Where is my ticket?',
  text: 'Hello, I never got my ticket.',
  // The provider's verdict that SPF, DKIM or DMARC passed.
  authenticated: true,
  ...overrides,
})

const whatsapp = (id: string, from = '4520000000', text = 'Hej fra WhatsApp') => ({
  object: 'whatsapp_business_account',
  entry: [{
    id: 'waba-1',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { phone_number_id: 'PNID1', display_phone_number: '4512345678' },
        contacts: [{ wa_id: from, profile: { name: 'Ola' } }],
        messages: [{ from, id, timestamp: '1700000000', type: 'text', text: { body: text } }],
      },
    }],
  }],
})

describe('inbox (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({
    rootDir,
    dev: true,
    serverStartTimeout: 240_000,
    setupTimeout: 300_000,
    env: {
      // Channel secrets come from the runtime config only: the per-ref override of a declared ref, and the JSON object.
      NUXT_INBOX_SECRETS_ENV_TOKEN: 'env-token-value',
      NUXT_INBOX_SECRETS: JSON.stringify({ JSON_TOKEN: 'json-token-value' }),
      // The old direct environment read is gone: this never resolves.
      NUXT_INBOX_SECRET_LEGACY_TOKEN: 'legacy-token-value',
    },
  })

  let admin: Session
  let coord: Session
  let crew: Session
  let wild: Session
  let dpo: Session
  let support: Json
  let board: Json

  beforeAll(async () => {
    admin = await registerUser('Admin', 'admin.test')
    coord = await registerUser('Coord', 'coord.test')
    crew = await registerUser('Crew', 'crew.test')
    wild = await registerUser('Wild', 'wild.test')
    dpo = await registerUser('Dpo', 'dpo.test')
  })

  const threadsOf = async (session: Session, query = '') => (await as(session).json<Json>('GET', `${inboxApi.admin.threads}?pageSize=90${query}`)).items as Json[]
  const detail = (session: Session, id: string) => as(session).json<Json>('GET', inboxApi.admin.thread(id))

  /** An email to support, stored; answers the stored thread id. */
  async function emailThread(overrides: Json = {}): Promise<string> {
    const response = await postEmail(email(overrides))
    const body = await response.json() as Json
    expect(body.status, JSON.stringify(body)).toBe('received')
    return body.threadId
  }

  describe('mailboxes', () => {
    it('creates the configured mailboxes and shows each person the ones they read', async () => {
      const all = await as(admin).json<Json[]>('GET', inboxApi.admin.mailboxes)
      support = all.find(mailbox => mailbox.key === 'support')!
      board = all.find(mailbox => mailbox.key === 'board')!
      expect(support).toMatchObject({ ownerType: 'platform', grants: [{ kind: 'role', role: 'coordinator' }] })
      expect(board.retentionDays).toBe(365)
      expect((await as(coord).json<Json[]>('GET', inboxApi.admin.mailboxes)).map(mailbox => mailbox.key)).toEqual(['support'])
      expect(await as(crew).json<Json[]>('GET', inboxApi.admin.mailboxes)).toEqual([])
      await expectApiError(as().json('GET', inboxApi.admin.mailboxes), 401)
      await expectApiError(as(crew).json('GET', inboxApi.admin.mailbox(board.id)), 404, 'not_found')
    })

    it('never makes a platform mailbox open to every signed-in user, and only staff manage them', async () => {
      await expectApiError(as(admin).json('POST', inboxApi.admin.mailboxes, { key: 'open', name: 'Open' }), 400)
      await expectApiError(as(admin).json('POST', inboxApi.admin.mailboxes, { key: 'public', name: 'Public', grants: [{ kind: 'public' }] }), 400)
      await expectApiError(as(admin).json('POST', inboxApi.admin.mailboxes, { key: 'nobody', name: 'Nobody', grants: [] }), 400)
      await expectApiError(as(admin).json('POST', inboxApi.admin.mailboxes, { key: 'galaxy', name: 'Galaxy', grants: [{ kind: 'galaxy' }] }), 400)
      await expectApiError(as(admin).json('POST', inboxApi.admin.mailboxes, { key: 'typo', name: 'Typo', grants: [{ kind: 'role', role: 'crew', permission: 'inbox:read' }] }), 400)
      await expectApiError(as(coord).json('POST', inboxApi.admin.mailboxes, { key: 'x', name: 'X', grants: [{ kind: 'role', role: 'crew' }] }), 403, 'forbidden')
      await expectApiError(as(admin).json('POST', inboxApi.admin.mailboxes, { key: 'support', name: 'Again', grants: [{ kind: 'role', role: 'crew' }] }), 409)
      // A stored list cannot be opened to everyone on a patch either.
      await expectApiError(as(admin).json('PATCH', inboxApi.admin.mailbox(board.id), { grants: [{ kind: 'public' }] }), 400)
      const renamed = await as(admin).json<Json>('PATCH', inboxApi.admin.mailbox(board.id), { name: { da: 'Bestyrelse', en: 'Board' } })
      expect(renamed.name).toEqual({ da: 'Bestyrelse', en: 'Board' })
    })

    it('never opens a mailbox to every signed-in user, and a stored signed-in grant counts for nobody', async () => {
      const created = await expectApiError(as(admin).json('POST', inboxApi.admin.mailboxes, { key: 'everyone', name: 'Everyone', grants: [{ kind: 'signed-in' }] }), 400)
      expect(JSON.stringify(created.data)).toContain('every signed-in user')
      // Not even next to a grant that names people.
      await expectApiError(as(admin).json('POST', inboxApi.admin.mailboxes, { key: 'mixed', name: 'Mixed', grants: [{ kind: 'role', role: 'coordinator' }, { kind: 'signed-in' }] }), 400)
      await expectApiError(as(admin).json('PATCH', inboxApi.admin.mailbox(board.id), { grants: [{ kind: 'signed-in' }] }), 400)

      // A list stored before the rule: the signed-in grant admits nobody, and the crew member still sees no mailbox.
      const before = board.grants
      await $fetch('/api/test/mailbox-grants', { method: 'POST', body: { id: board.id, grants: [{ kind: 'signed-in' }] } })
      try {
        expect(await as(crew).json<Json[]>('GET', inboxApi.admin.mailboxes)).toEqual([])
        await expectApiError(as(crew).json('GET', inboxApi.admin.mailbox(board.id)), 404, 'not_found')
      }
      finally {
        await $fetch('/api/test/mailbox-grants', { method: 'POST', body: { id: board.id, grants: before } })
      }
    })

    it('lets a team\'s leads read a team mailbox', async () => {
      await expectApiError(as(admin).json('POST', inboxApi.admin.mailboxes, { key: 'ghost-team', name: 'Ghost', ownerType: 'team', ownerId: 'tem_missing' }), 400)
      const team = await as(admin).json<Json>('POST', inboxApi.admin.mailboxes, { key: 'bar-team', name: 'Bar team', ownerType: 'team', ownerId: 'tem_known' })
      expect(team.grants).toEqual([])
      expect(await as(crew).json<Json[]>('GET', inboxApi.admin.mailboxes)).toEqual([])
      await makeLead(crew.cookie, 'tem_known')
      expect((await as(crew).json<Json[]>('GET', inboxApi.admin.mailboxes)).map(mailbox => mailbox.key)).toEqual(['bar-team'])
      // An empty mailbox can go; the support mailbox keeps its threads and cannot.
      const spare = await as(admin).json<Json>('POST', inboxApi.admin.mailboxes, { key: 'spare', name: 'Spare', grants: [{ kind: 'role', role: 'admin' }] })
      expect((await as(admin).fetch('DELETE', inboxApi.admin.mailbox(spare.id))).status).toBe(204)
    })
  })

  describe('channels', () => {
    it('are managed by admins in a session only, and never store a secret', async () => {
      const connect = (body: Json) => as(admin).json<Json>('POST', inboxApi.admin.channels, body)
      const emailAccount = await connect({ mailboxId: support.id, channel: 'email', address: 'Support@Inbox.test', config: { replyTo: 'support@inbox.test' } })
      expect(emailAccount).toMatchObject({ channel: 'email', address: 'support@inbox.test', secretRef: null, secretConfigured: false, enabled: true })
      await connect({ mailboxId: support.id, channel: 'form', address: 'contact' })
      await connect({ mailboxId: support.id, channel: 'whatsapp', address: 'PNID1', secretRef: 'WHATSAPP_TOKEN' })
      await connect({ mailboxId: support.id, channel: 'messenger', address: 'PAGE1', secretRef: 'PAGE_TOKEN' })
      const fake = await connect({ mailboxId: support.id, channel: 'test.fake', address: 'fake-1', secretRef: 'FAKE_TOKEN' })
      expect(fake.secretConfigured).toBe(true)
      await connect({ mailboxId: board.id, channel: 'email', address: 'board@inbox.test' })

      await expectApiError(connect({ mailboxId: support.id, channel: 'email', address: 'support@inbox.test' }), 409)
      await expectApiError(connect({ mailboxId: support.id, channel: 'carrier-pigeon', address: 'x' }), 400)
      await expectApiError(connect({ mailboxId: support.id, channel: 'email', address: 'x@inbox.test', config: { apiToken: 'secret' } }), 400)
      await expectApiError(connect({ mailboxId: support.id, channel: 'email', address: 'y@inbox.test', secretRef: 'NUXT_SESSION_PASSWORD; drop' }), 400)

      const listed = await as(admin).json<Json[]>('GET', inboxApi.admin.channels)
      expect(listed).toHaveLength(6)
      expect(JSON.stringify(listed)).not.toContain('fake-token-value')

      await expectApiError(as(coord).json('GET', inboxApi.admin.channels), 403, 'forbidden')
      const token = await createToken(admin.cookie, ['*'])
      await expectApiError(bearer(token).json('GET', inboxApi.admin.channels), 403, 'session_required')
      await expectApiError(bearer(token).json('POST', inboxApi.admin.channels, { mailboxId: support.id, channel: 'email', address: 'z@inbox.test' }), 403, 'session_required')
    })

    it('reads channel secrets from the runtime config only, overridable by NUXT_INBOX_SECRETS_*', async () => {
      const connect = (address: string, secretRef: string) => as(admin).json<Json>('POST', inboxApi.admin.channels, { mailboxId: support.id, channel: 'test.fake', address, secretRef })
      expect((await connect('fake-env', 'ENV_TOKEN')).secretConfigured).toBe(true)
      expect((await connect('fake-json', 'JSON_TOKEN')).secretConfigured).toBe(true)
      // `NUXT_INBOX_SECRET_LEGACY_TOKEN` is set, but the environment is never read directly.
      expect((await connect('fake-legacy', 'LEGACY_TOKEN')).secretConfigured).toBe(false)

      // The reply goes out with the value of the environment override.
      const headers = { 'content-type': 'application/json', 'x-fake-token': 'let-me-in' }
      await fetch(inboxApi.webhooks.channel('test.fake'), { method: 'POST', headers, body: JSON.stringify({ to: 'fake-env', from: 'env-user', id: 'env-1', text: 'Hello' }) })
      const thread = (await threadsOf(admin, '&channel=test.fake')).find(item => item.contact?.externalId === 'env-user')!
      await as(admin).json('POST', inboxApi.admin.messages(thread.id), { body: 'Hi' })
      expect((await getSent()).at(-1)).toMatchObject({ threadId: thread.id, secret: 'env-token-value' })
      // Out of the active list, where the module channel tests look for their own thread.
      await as(admin).json('PATCH', inboxApi.admin.thread(thread.id), { status: 'closed' })
    })
  })

  describe('email webhook', () => {
    it('refuses a missing or wrong signature', async () => {
      await expectApiError(postEmail(email(), null), 401, 'invalid_signature')
      await expectApiError(postEmail(email(), 'sha256=0000000000000000000000000000000000000000000000000000000000000000'), 401, 'invalid_signature')
      const body = JSON.stringify(email())
      const response = await fetch(inboxApi.webhooks.email, { method: 'POST', headers: { 'content-type': 'application/json', 'x-inbox-signature': 'sha256=deadbeef' }, body })
      expect(response.status).toBe(401)
    })

    it('stores an email once, however often it is delivered, and answers 200 for unroutable mail', async () => {
      const payload = email()
      const first = await (await postEmail(payload)).json() as Json
      const second = await (await postEmail(payload)).json() as Json
      expect(first.status).toBe('received')
      expect(second).toEqual({ status: 'duplicate', messageId: first.messageId })
      const thread = await detail(admin, first.threadId)
      expect(thread.messages).toHaveLength(1)
      expect(thread.thread).toMatchObject({ channel: 'email', status: 'open', subject: 'Where is my ticket?', mailboxId: support.id })
      expect(thread.contact).toMatchObject({ name: 'Kari Nordmann', email: payload.from.email })

      const unknown = await postEmail(email({ to: 'nobody@inbox.test' }))
      expect(unknown.status).toBe(200)
      expect(await unknown.json()).toEqual({ status: 'ignored', reason: 'no_account' })
      await expectApiError(postEmail({ hello: 'world' }), 400)
    })

    it('replies by email with the mailbox as Reply-To, and threads the answer back', async () => {
      const threadId = await emailThread()
      const reply = await as(coord).json<Json>('POST', inboxApi.admin.messages(threadId), { body: 'We sent it again.', status: 'pending' })
      expect(reply.message).toMatchObject({ direction: 'out', body: 'We sent it again.' })
      expect(reply.thread.status).toBe('pending')
      const sent = (await getEmails()).at(-1)!
      expect(sent.replyTo).toBe('support@inbox.test')
      expect(sent.subject).toBe(`Re: Where is my ticket? [${threadId}]`)
      expect(sent.text).toBe('We sent it again.')

      const contact = (await detail(admin, threadId)).contact
      const answer = await (await postEmail(email({ from: { email: contact.email }, subject: sent.subject, text: 'Got it, thanks!' }))).json() as Json
      expect(answer.threadId).toBe(threadId)
      const thread = await detail(admin, threadId)
      expect(thread.messages.map((message: Json) => message.direction)).toEqual(['in', 'out', 'in'])
      // An answer from the person reopens a pending thread.
      expect(thread.thread.status).toBe('open')
    })

    it('stores a provider id once per channel account, not once overall', async () => {
      const payload = email()
      const toSupport = await (await postEmail(payload)).json() as Json
      // The same Message-ID delivered to another mailbox's address is another message.
      const toBoard = await (await postEmail({ ...payload, to: 'board@inbox.test' })).json() as Json
      expect(toSupport.status).toBe('received')
      expect(toBoard.status).toBe('received')
      expect(toBoard.messageId).not.toBe(toSupport.messageId)
      expect((await detail(admin, toBoard.threadId)).thread.mailboxId).toBe(board.id)
      // A redelivery to either is still a duplicate.
      expect(await (await postEmail({ ...payload, to: 'board@inbox.test' })).json()).toEqual({ status: 'duplicate', messageId: toBoard.messageId })
      expect(await (await postEmail(payload)).json()).toEqual({ status: 'duplicate', messageId: toSupport.messageId })
    })

    it('keeps the cc recipients of an email, shown to people who see contact details', async () => {
      const threadId = await emailThread({ cc: ['Ola <Ola@Example.org>', { email: 'support@inbox.test' }, { email: 'lise@example.org', name: 'Lise' }] })
      const forAdmin = await detail(admin, threadId)
      expect(forAdmin.messages[0].cc).toEqual(['ola@example.org', 'lise@example.org'])
      expect(await detail(coord, threadId).then(thread => thread.messages[0])).not.toHaveProperty('cc')
      const exported = await as(admin).json<Json>('GET', inboxApi.admin.contactExport(forAdmin.contact.id))
      expect(exported.threads.find((item: Json) => item.thread.id === threadId).messages[0].cc).toEqual(['ola@example.org', 'lise@example.org'])
      // A reply copies the same people again.
      await as(admin).json('POST', inboxApi.admin.messages(threadId), { body: 'Thanks, all.' })
      const sent = (await getEmails()).at(-1)! as Json
      expect(sent.to).toBe(forAdmin.contact.email)
      expect(sent.cc).toEqual(['ola@example.org', 'lise@example.org'])
      // The reply keeps who it copied, shown like the email's cc: to people who see contact details only.
      const reply = (await detail(admin, threadId)).messages.find((message: Json) => message.direction === 'out')
      expect(reply.cc).toEqual(['ola@example.org', 'lise@example.org'])
      expect((await detail(coord, threadId)).messages.find((message: Json) => message.direction === 'out')).not.toHaveProperty('cc')
    })

    it('copies the cc of the person\'s latest email in a reply, without our own addresses', async () => {
      const from = { email: `cc${++counter}@example.org`, name: 'Copy Person' }
      // The person copies themselves, another of our mailboxes and the reply address: none of them is copied back.
      const threadId = await emailThread({ from, cc: [from.email, 'board@inbox.test', 'Ola@Example.org'] })
      await as(admin).json('POST', inboxApi.admin.messages(threadId), { body: 'First answer.' })
      expect(((await getEmails()).at(-1)! as Json).cc).toEqual(['ola@example.org'])

      // Their next email copies someone else: the next reply follows it.
      const subject = ((await getEmails()).at(-1)! as Json).subject
      await postEmail(email({ from, subject, cc: 'nina@example.org', text: 'Adding Nina.' }))
      await as(admin).json('POST', inboxApi.admin.messages(threadId), { body: 'Hi Nina.' })
      expect(((await getEmails()).at(-1)! as Json).cc).toEqual(['nina@example.org'])

      // An email that copies nobody: the reply has no cc at all.
      await postEmail(email({ from, subject, text: 'Just me now.' }))
      await as(admin).json('POST', inboxApi.admin.messages(threadId), { body: 'Noted.' })
      expect((await getEmails()).at(-1)!).not.toHaveProperty('cc')
      const replies = (await detail(admin, threadId)).messages.filter((message: Json) => message.direction === 'out')
      expect(replies.map((message: Json) => message.cc)).toEqual([['ola@example.org'], ['nina@example.org'], null])
    })

    it('routes an email on To and Cc, stored for every mailbox it reaches', async () => {
      const payload = email({ cc: ['Board@Inbox.test', 'ola@example.org'] })
      const both = await (await postEmail(payload)).json() as Json
      expect(both.status).toBe('received')
      expect((both.deliveries as Json[]).map(delivery => [delivery.mailboxId, delivery.status])).toEqual([[support.id, 'received'], [board.id, 'received']])
      const boardThread = (both.deliveries as Json[])[1]!.threadId
      expect(boardThread).not.toBe(both.threadId)
      expect((await detail(admin, boardThread)).thread.mailboxId).toBe(board.id)
      // A redelivery is a duplicate for each.
      expect(((await (await postEmail(payload)).json() as Json).deliveries as Json[]).map(delivery => delivery.status)).toEqual(['duplicate', 'duplicate'])

      // A mailbox that is only copied still gets the email.
      const copied = await (await postEmail(email({ to: 'someone@elsewhere.org', cc: 'board@inbox.test' }))).json() as Json
      expect(copied).toMatchObject({ status: 'received' })
      expect(copied).not.toHaveProperty('deliveries')
      expect((await detail(admin, copied.threadId)).thread.mailboxId).toBe(board.id)
    })

    it('never copies the cc of an unverified email into a reply', async () => {
      const threadId = await emailThread({ authenticated: false, cc: ['first@example.org', 'second@example.org'] })
      // Kept and shown, as what the email said, but never sent to.
      expect((await detail(admin, threadId)).messages[0].cc).toEqual(['first@example.org', 'second@example.org'])
      await as(admin).json('POST', inboxApi.admin.messages(threadId), { body: 'Who is this?' })
      expect((await getEmails()).at(-1)!).not.toHaveProperty('cc')
    })

    it('replies only to one valid address', async () => {
      const threadId = await emailThread({ from: 'one@example.org, two@example.org' })
      await expectApiError(as(admin).json('POST', inboxApi.admin.messages(threadId), { body: 'To both?' }), 409, 'no_reply_address')
      expect((await detail(admin, threadId)).messages.map((message: Json) => message.direction)).toEqual(['in'])
    })

    it('never copies or stores a malformed cc address', async () => {
      const threadId = await emailThread({ cc: ['not an address', 'ola@example', 'Ola <ola@example.org>', 'a@b@example.org'] })
      expect((await detail(admin, threadId)).messages[0].cc).toEqual(['ola@example.org'])
      await as(admin).json('POST', inboxApi.admin.messages(threadId), { body: 'Thanks.' })
      expect(((await getEmails()).at(-1)! as Json).cc).toEqual(['ola@example.org'])
      expect((await detail(admin, threadId)).messages.find((message: Json) => message.direction === 'out').cc).toEqual(['ola@example.org'])
    })
  })

  describe('unverified senders and subjects', () => {
    it('never threads an unauthenticated email into an existing thread', async () => {
      const threadId = await emailThread()
      const { contact } = await detail(admin, threadId)
      // A forged answer: the right sender address and marker, but the provider could not verify the sender.
      const forged = await (await postEmail(email({ from: { email: contact.email, name: 'Someone Else' }, subject: `Re: Where is my ticket? [${threadId}]`, text: 'Send the tickets to me instead', authenticated: false }))).json() as Json
      expect(forged.status).toBe('received')
      expect(forged.threadId).not.toBe(threadId)
      // Not even into the contact's open thread, and the contact keeps its name.
      const noMarker = await (await postEmail(email({ from: { email: contact.email, name: 'Someone Else' }, authenticated: undefined }))).json() as Json
      expect([threadId, forged.threadId]).not.toContain(noMarker.threadId)
      expect((await detail(admin, threadId)).messages).toHaveLength(1)
      expect((await detail(admin, forged.threadId)).contact.name).toBe('Kari Nordmann')
    })

    it('keeps control characters out of subjects, stored and sent', async () => {
      const threadId = await emailThread({ subject: 'Tickets\r\nBcc: evil@example.org\tnow' })
      expect((await detail(admin, threadId)).thread.subject).toBe('Tickets Bcc: evil@example.org now')
      await as(coord).json('POST', inboxApi.admin.messages(threadId), { body: 'On it.' })
      const sent = (await getEmails()).at(-1)!
      expect(sent.subject).toBe(`Re: Tickets Bcc: evil@example.org now [${threadId}]`)
      expect(sent.subject).not.toMatch(/[\r\n\t]/)
    })

    it('refuses webhook bodies over 1 MB', async () => {
      const big = email({ text: 'x'.repeat(1_100_000) })
      await expectApiError(postEmail(big), 413, 'payload_too_large')
      await expectApiError(postMeta({ object: 'page', entry: [], padding: 'x'.repeat(1_100_000) }), 413, 'payload_too_large')
      // A module channel's webhook too: the inbox reads the body for the adapter, with or without a content-length.
      const headers = { 'content-type': 'application/json', 'x-fake-token': 'let-me-in' }
      expect((await fetch(inboxApi.webhooks.channel('test.fake'), { method: 'POST', headers, body: 'x'.repeat(1_100_000) })).status).toBe(413)
      const chunked = new ReadableStream({
        start(controller) {
          for (let i = 0; i < 11; i++) controller.enqueue(new TextEncoder().encode('x'.repeat(100_000)))
          controller.close()
        },
      })
      const streamed = await fetch(inboxApi.webhooks.channel('test.fake'), { method: 'POST', headers, body: chunked, duplex: 'half' } as RequestInit)
      expect(streamed.status).toBe(413)
    })
  })

  describe('meta webhook', () => {
    it('answers the subscription check with the verify token only', async () => {
      const ok = await fetch(`${inboxApi.webhooks.meta}?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=12345`)
      expect(ok.status).toBe(200)
      expect(await ok.text()).toBe('12345')
      // Compared in constant time: a prefix, a longer token or an empty one fail like any other.
      for (const token of ['nope', 'test-verify', 'test-verify-token-plus', '']) {
        const wrong = await fetch(`${inboxApi.webhooks.meta}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=12345`)
        expect(wrong.status, token).toBe(403)
      }
    })

    it('checks X-Hub-Signature-256 and stores WhatsApp and Messenger messages once', async () => {
      await expectApiError(postMeta(whatsapp('wamid.bad'), null), 401, 'invalid_signature')
      await expectApiError(postMeta(whatsapp('wamid.bad'), 'sha256=1234'), 401, 'invalid_signature')

      const first = await (await postMeta(whatsapp('wamid.1'))).json() as Json
      expect(first).toEqual({ received: 1, duplicates: 0, ignored: 0, failed: 0 })
      const again = await (await postMeta(whatsapp('wamid.1'))).json() as Json
      expect(again).toEqual({ received: 0, duplicates: 1, ignored: 0, failed: 0 })

      const messenger = await (await postMeta({ object: 'page', entry: [{ id: 'PAGE1', time: 1, messaging: [{ sender: { id: 'PSID1' }, recipient: { id: 'PAGE1' }, timestamp: 1, message: { mid: 'm_1', text: 'Hi page' } }] }] })).json() as Json
      expect(messenger.received).toBe(1)
      const unknownPage = await (await postMeta({ object: 'page', entry: [{ id: 'PAGE9', time: 1, messaging: [{ sender: { id: 'PSID1' }, recipient: { id: 'PAGE9' }, timestamp: 1, message: { mid: 'm_2', text: 'Hi' } }] }] })).json() as Json
      expect(unknownPage.ignored).toBe(1)

      const threads = await threadsOf(admin, '&channel=whatsapp')
      expect(threads).toHaveLength(1)
      expect(threads[0]!.contact).toMatchObject({ name: 'Ola', phone: '+4520000000', externalId: '4520000000' })
      expect(threads[0]!.preview).toBe('Hej fra WhatsApp')
    })

    it('fails a WhatsApp reply without an access token and stores nothing', async () => {
      const [thread] = await threadsOf(admin, '&channel=whatsapp')
      await expectApiError(as(admin).json('POST', inboxApi.admin.messages(thread!.id), { body: 'Hej!' }), 409, 'channel_not_configured')
      expect((await detail(admin, thread!.id)).messages).toHaveLength(1)
    })
  })

  describe('contact form', () => {
    it('turns a submission of a connected form into a thread and answers it by email', async () => {
      await as(admin).json('POST', formsApi.admin.forms, {
        slug: 'contact',
        name: 'Contact us',
        status: 'published',
        definition: {
          mode: 'single',
          storage: 'db',
          access: { availability: 'web', auth: 'none' },
          steps: [{
            id: 'main',
            fields: [
              { key: 'name', type: 'text', required: true, label: 'Name' },
              { key: 'email', type: 'email', required: true, label: 'Email' },
              { key: 'subject', type: 'text', label: 'Subject' },
              { key: 'message', type: 'textarea', required: true, label: 'Message' },
            ],
          }],
        },
      })
      await as().json('POST', formsApi.submit('contact'), { answers: { name: 'Lise', email: 'Lise@Example.org', subject: 'Volunteering', message: 'Can I help at the bar?' }, locale: 'en' })
      const [thread] = await threadsOf(admin, '&channel=form')
      expect(thread).toMatchObject({ subject: 'Volunteering', contact: { name: 'Lise', email: 'lise@example.org' } })
      expect(thread!.preview).toMatch(/^Can I help at the bar\?/)

      await as(admin).json('POST', inboxApi.admin.messages(thread!.id), { body: 'Yes, welcome!' })
      const sent = (await getEmails()).at(-1)!
      expect(sent).toMatchObject({ to: 'lise@example.org', replyTo: 'support@inbox.test', text: 'Yes, welcome!' })

      // Lise answers the reply by email: a verified sender with the thread's marker and the contact's address.
      const answer = await (await postEmail(email({ from: { email: 'lise@example.org', name: 'Lise' }, subject: sent.subject, text: 'Great, see you there!' }))).json() as Json
      expect(answer.threadId).toBe(thread!.id)
      const conversation = await detail(admin, thread!.id)
      expect(conversation.messages.map((message: Json) => [message.direction, message.body])).toEqual([
        ['in', 'Can I help at the bar?\n\nSubject: Volunteering'],
        ['out', 'Yes, welcome!'],
        ['in', 'Great, see you there!'],
      ])
      expect(conversation.thread.channel).toBe('form')
    })

    it('treats a form submission with someone else\'s email as unverified', async () => {
      const before = (await threadsOf(admin, '&channel=form&status=all')).map(thread => thread.id)
      await as().json('POST', formsApi.submit('contact'), { answers: { name: 'Mallory', email: 'lise@example.org', subject: 'Change of plans', message: 'Please send everything to mallory@example.org' }, locale: 'en' })
      const after = await threadsOf(admin, '&channel=form&status=all')
      const created = after.filter(thread => !before.includes(thread.id))
      // A new thread of its own, never one of Lise's, and Lise's contact keeps her name.
      expect(created).toHaveLength(1)
      expect(created[0]).toMatchObject({ subject: 'Change of plans', contact: { name: 'Lise', email: 'lise@example.org' } })
      expect(after.filter(thread => thread.contact?.email === 'lise@example.org')).toHaveLength(2)
    })

    it('verifies a signed-in submitter only by their own email address', async () => {
      const submit = (session: Session | undefined, answers: Json) => as(session).json('POST', formsApi.submit('contact'), { answers, locale: 'en' })
      const formThreads = async (address: string) => (await threadsOf(admin, '&channel=form&status=all')).filter(thread => thread.contact?.email === address)
      const person = await registerUser('Former')
      const victim = `victim${++counter}@example.org`

      // Signed in, but with someone else's address: unverified, like an anonymous submission. It never joins the
      // owner's thread, renames their contact or links it to the submitter's account.
      await submit(undefined, { name: 'Victim', email: victim, subject: 'First', message: 'Hello from the owner' })
      await submit(person, { name: 'Mallory', email: victim, subject: 'Second', message: 'Send everything to me' })
      const victims = await formThreads(victim)
      expect(victims).toHaveLength(2)
      expect(victims.map(thread => thread.contact.name)).toEqual(['Victim', 'Victim'])
      expect(victims.map(thread => thread.contact.userId)).toEqual([null, null])

      // Their own address (in any case): verified, linked to their account, and the next one joins the open thread.
      await submit(person, { name: 'Former', email: person.email.toUpperCase(), subject: 'Mine', message: 'First of mine' })
      await submit(person, { name: 'Former', email: person.email, subject: 'Mine again', message: 'Second of mine' })
      const mine = await formThreads(person.email)
      expect(mine).toHaveLength(1)
      expect(mine[0]!.contact.userId).toBe(person.id)
      // The joined submission keeps its own subject in its message.
      expect((await detail(admin, mine[0]!.id)).messages.map((message: Json) => message.body)).toEqual(['First of mine\n\nSubject: Mine', 'Second of mine\n\nSubject: Mine again'])
    })

    it('files an email answer to a form thread under the person who sent it, for export and erase', async () => {
      const address = `nora${++counter}@example.org`
      await as().json('POST', formsApi.submit('contact'), { answers: { name: 'Nora', email: address, subject: 'Bar shifts', message: 'Asked in the form' }, locale: 'en' })
      const formThread = (await threadsOf(admin, '&channel=form&status=all')).find(thread => thread.contact?.email === address)!
      await as(admin).json('POST', inboxApi.admin.messages(formThread.id), { body: 'Answered by staff' })
      const sent = (await getEmails()).at(-1)!
      const answerPayload = email({ from: { email: address, name: 'Nora' }, subject: sent.subject, text: 'Answered by email' })
      const answer = await (await postEmail(answerPayload)).json() as Json
      expect(answer.threadId).toBe(formThread.id)

      // The answer sits in the form contact's thread, but its sender is Nora's email contact.
      const messages = (await detail(admin, formThread.id)).messages as Json[]
      const emailContact = messages.at(-1)!.contactId
      expect(messages.map(message => message.contactId)).toEqual([formThread.contactId, null, emailContact])
      expect(emailContact).not.toBe(formThread.contactId)

      // An export of the email contact covers the form contact with the same address, and the answer.
      const exported = await as(admin).json<Json>('GET', inboxApi.admin.contactExport(emailContact))
      expect(exported.contact).toMatchObject({ id: emailContact, channel: 'email', email: address })
      expect((exported.related as Json[]).map(contact => contact.id)).toEqual([formThread.contactId])
      expect((exported.threads as Json[]).map(item => item.thread.id)).toEqual([formThread.id])
      expect(exported.threads[0].messages.map((message: Json) => message.body)).toEqual(['Asked in the form\n\nSubject: Bar shifts', 'Answered by staff', 'Answered by email'])

      // So does an erase: both contacts go, the thread is blanked, and the answer never comes back.
      const erased = await as(admin).json<Json>('POST', inboxApi.admin.contactErase(emailContact))
      expect(erased).toMatchObject({ id: emailContact, threads: 1, contacts: 2 })
      const after = await detail(admin, formThread.id)
      expect(after.messages.every((message: Json) => message.body === '')).toBe(true)
      expect(after.contact.erasedAt).toBeTruthy()
      expect(await (await postEmail(answerPayload)).json()).toEqual({ status: 'ignored', reason: 'removed' })
    })

    it('titles a thread with the chosen option\'s label, or the text typed for it, and keeps every answer', async () => {
      await as(admin).json('POST', formsApi.admin.forms, {
        slug: 'contact-topics',
        name: 'Contact by topic',
        status: 'published',
        definition: {
          mode: 'single',
          storage: 'db',
          access: { availability: 'web', auth: 'none' },
          steps: [{
            id: 'main',
            fields: [
              { key: 'name', type: 'text', required: true, label: 'Name' },
              { key: 'email', type: 'email', required: true, label: { en: 'Email', da: 'E-mail' } },
              { key: 'phone', type: 'text', label: { en: 'Phone', da: 'Telefon' } },
              { key: 'subject', type: 'select', required: true, label: { en: 'Subject', da: 'Emne' }, options: [
                { value: 'volunteering', label: { en: 'Volunteering', da: 'Frivillig' } },
                { value: 'other', label: { en: 'Other', da: 'Andet' } },
              ] },
              { key: 'subjectOther', type: 'text', label: { en: 'Other subject', da: 'Andet emne' }, showIf: { field: 'subject', op: 'eq', value: 'other' } },
              { key: 'message', type: 'textarea', required: true, label: 'Message' },
            ],
          }],
        },
      })
      await as(admin).json('POST', inboxApi.admin.channels, { mailboxId: support.id, channel: 'form', address: 'contact-topics' })
      const submit = async (answers: Json, locale = 'en') => {
        const address = `topic${++counter}@example.org`
        await as().json('POST', formsApi.submit('contact-topics'), { answers: { name: 'Topic', email: address, ...answers }, locale })
        const thread = (await threadsOf(admin, '&channel=form&status=all')).find(item => item.contact?.email === address)!
        return { thread, bodies: (await detail(admin, thread.id)).messages.map((message: Json) => message.body) }
      }

      // A chosen option titles the thread with its label in the submission's language, never its value.
      const chosen = await submit({ subject: 'volunteering', phone: '+45 20 00 00 00', message: 'Can I help?' }, 'da')
      expect(chosen.thread.subject).toBe('Frivillig')
      expect(chosen.bodies).toEqual(['Can I help?\n\nTelefon: +45 20 00 00 00\nEmne: Frivillig'])

      // "Other" with a typed subject: the typed text titles the thread, and both answers stay in the message.
      const other = await submit({ subject: 'other', subjectOther: 'Lost and found', message: 'I lost my jacket' })
      expect(other.thread.subject).toBe('Lost and found')
      expect(other.bodies).toEqual(['I lost my jacket\n\nSubject: Other\nOther subject: Lost and found'])
    })
  })

  describe('replies through a channel and notes', () => {
    let threadId: string

    it('reads a module channel\'s own webhook', async () => {
      const refused = await fetch(inboxApi.webhooks.channel('test.fake'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
      expect(refused.status).toBe(401)
      const response = await fetch(inboxApi.webhooks.channel('test.fake'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-fake-token': 'let-me-in' },
        body: JSON.stringify({ to: 'fake-1', from: 'fake-user-1', name: 'Fake Person', id: 'f-1', text: 'Hello through the fake channel' }),
      })
      expect(await response.json()).toEqual({ received: 1, duplicates: 0, ignored: 0, failed: 0 })
      threadId = (await threadsOf(admin, '&channel=test.fake'))[0]!.id
      expect((await fetch(inboxApi.webhooks.channel('nope'), { method: 'POST' })).status).toBe(404)
    })

    it('sends a reply through the thread\'s channel with the account\'s secret', async () => {
      const reply = await as(coord).json<Json>('POST', inboxApi.admin.messages(threadId), { body: 'Hi from staff' })
      expect(reply.message.author).toMatchObject({ id: coord.id, name: 'Coord' })
      expect((await getSent()).at(-1)).toEqual({ threadId, to: 'fake-user-1', body: 'Hi from staff', secret: 'fake-token-value' })
      const hooks = (await getHooks()).filter(hook => hook.threadId === threadId)
      expect(hooks.map(hook => hook.name)).toEqual(['message:received', 'message:sent'])
    })

    it('stores nothing when the channel fails', async () => {
      await expectApiError(as(coord).json('POST', inboxApi.admin.messages(threadId), { body: 'This will FAIL' }), 502, 'delivery_failed')
      expect((await detail(admin, threadId)).messages.map((message: Json) => message.body)).not.toContain('This will FAIL')
    })

    it('keeps notes internal: never sent, no hook', async () => {
      const sentBefore = (await getSent()).length
      const note = await as(coord).json<Json>('POST', inboxApi.admin.notes(threadId), { body: 'Known customer, be kind.' })
      expect(note).toMatchObject({ direction: 'note', body: 'Known customer, be kind.' })
      expect((await getSent()).length).toBe(sentBefore)
      expect((await getHooks()).filter(hook => hook.messageId === note.id)).toEqual([])
      const messages = (await detail(coord, threadId)).messages as Json[]
      expect(messages.map(message => message.direction)).toEqual(['in', 'out', 'note'])
      await expectApiError(as(crew).json('POST', inboxApi.admin.notes(threadId), { body: 'x' }), 404)
    })
  })

  describe('assignment and hiding', () => {
    it('assigns, fires the hook and checks the assignee', async () => {
      const threadId = await emailThread()
      const assigned = await as(coord).json<Json>('PATCH', inboxApi.admin.thread(threadId), { assigneeId: coord.id })
      expect(assigned.assigneeId).toBe(coord.id)
      expect((await getHooks()).filter(hook => hook.threadId === threadId && hook.name === 'thread:assigned').map(hook => hook.data)[0]).toEqual({ assigneeId: coord.id, previous: null })
      await expectApiError(as(coord).json('PATCH', inboxApi.admin.thread(threadId), { assigneeId: 999_999 }), 400)
      // Evaluated for the assignee: crew reads no mailbox (it leads only the bar team's), wild manages every mailbox.
      await expectApiError(as(coord).json('PATCH', inboxApi.admin.thread(threadId), { assigneeId: crew.id }), 409, 'assignee_no_access')
      expect((await as(coord).json<Json>('PATCH', inboxApi.admin.thread(threadId), { assigneeId: wild.id })).assigneeId).toBe(wild.id)
      await as(coord).json('PATCH', inboxApi.admin.thread(threadId), { assigneeId: coord.id })
      expect((await threadsOf(coord, '&assignee=me')).map(thread => thread.id)).toContain(threadId)
      const summary = await as(coord).json<Json>('GET', inboxApi.admin.summary)
      expect(summary.mine).toBeGreaterThanOrEqual(1)
      expect(summary.mailboxes).toBe(1)

      const closed = await as(coord).json<Json>('PATCH', inboxApi.admin.thread(threadId), { status: 'closed' })
      expect(closed.status).toBe('closed')
      expect((await getHooks()).filter(hook => hook.threadId === threadId && hook.name === 'thread:status-changed').map(hook => hook.data)).toEqual([{ from: 'open', to: 'closed' }])
    })

    it('tells the assignee about a new message only while they can still read the thread', async () => {
      await $fetch('/api/test/choices', { method: 'POST', body: { userId: String(coord.id), topics: { 'inbox.message': { email: true } } } })
      const from = { email: `assigned${++counter}@example.org`, name: 'Assigned Person' }
      const threadId = await emailThread({ from })
      await as(coord).json('PATCH', inboxApi.admin.thread(threadId), { assigneeId: coord.id })
      const before = (await getEmails()).length
      expect((await (await postEmail(email({ from, text: 'Any news?' }))).json() as Json).threadId).toBe(threadId)
      expect((await getEmails()).slice(before).map(sent => [sent.to, sent.subject])).toEqual([[coord.email, 'New inbox message']])

      // The support mailbox is narrowed to admins: coord can no longer read the thread they are assigned, and hears nothing.
      await $fetch('/api/test/mailbox-grants', { method: 'POST', body: { id: support.id, grants: [{ kind: 'role', role: 'admin' }] } })
      try {
        const count = (await getEmails()).length
        expect((await (await postEmail(email({ from, text: 'Hello again?' }))).json() as Json).threadId).toBe(threadId)
        expect((await getEmails()).length).toBe(count)
      }
      finally {
        await $fetch('/api/test/mailbox-grants', { method: 'POST', body: { id: support.id, grants: [{ kind: 'role', role: 'coordinator' }] } })
        await as(coord).json('PATCH', inboxApi.admin.thread(threadId), { status: 'closed' })
      }
    })

    it('hides a thread below a role: the same 404 as an unknown thread for everybody below it', async () => {
      const threadId = await emailThread()
      await as(coord).json('PATCH', inboxApi.admin.thread(threadId), { assigneeId: coord.id })
      await expectApiError(as(coord).json('POST', inboxApi.admin.hide(threadId), { role: 'admin' }), 400)
      const hidden = await as(admin).json<Json>('POST', inboxApi.admin.hide(threadId), { role: 'admin' })
      // The assignee lacks the role, so the thread is no longer theirs.
      expect(hidden).toMatchObject({ hiddenBelow: 'admin', assigneeId: null })

      const answer = (error: Json) => ({ statusCode: error.statusCode, statusMessage: error.statusMessage, data: error.data })
      const unknown = await expectApiError(as(coord).json('GET', inboxApi.admin.thread('ibt_00000000000000000000000000000000')), 404, 'not_found')
      const hiddenError = await expectApiError(as(coord).json('GET', inboxApi.admin.thread(threadId)), 404, 'not_found')
      expect(answer(hiddenError)).toEqual(answer(unknown))
      await expectApiError(as(coord).json('POST', inboxApi.admin.messages(threadId), { body: 'x' }), 404, 'not_found')
      expect((await threadsOf(coord, '&status=all')).map(thread => thread.id)).not.toContain(threadId)
      expect((await threadsOf(admin, '&status=all')).map(thread => thread.id)).toContain(threadId)
      await expectApiError(as(admin).json('PATCH', inboxApi.admin.thread(threadId), { assigneeId: coord.id }), 409, 'assignee_no_access')

      const shown = await as(admin).json<Json>('POST', inboxApi.admin.hide(threadId), { role: null })
      expect(shown.hiddenBelow).toBeNull()
      expect((await detail(coord, threadId)).thread.id).toBe(threadId)
      await expectApiError(as(crew).json('POST', inboxApi.admin.hide(threadId), { role: null }), 403, 'forbidden')
    })

    it('searches subjects with capital Ø, Æ and Å in any case, and an erase clears the search text', async () => {
      const marker = `dk${++counter}`
      const threadId = await emailThread({ subject: `ØL TIL FESTEN ÆBLER ÅBNING ${marker}` })
      const found = async (q: string) => (await threadsOf(admin, `&status=all&q=${encodeURIComponent(q)}`)).map(thread => thread.id)
      for (const q of [`øl til festen`, `ÆBLER åbning ${marker}`, `Øl Til`]) expect(await found(q), q).toContain(threadId)
      expect(await found(`æbler åbning ${marker}`)).toEqual([threadId])
      const contactId = (await detail(admin, threadId)).contact.id
      await as(admin).json('POST', inboxApi.admin.contactErase(contactId))
      expect(await found(`æbler åbning ${marker}`)).toEqual([])
    })

    it('search:reindex refolds inbox_threads.searchText left by the ASCII-only SQL backfill, keeps anonymised threads empty, and a second run changes nothing', async () => {
      const marker = `rx${++counter}`
      const found = async (q: string) => (await threadsOf(admin, `&status=all&q=${encodeURIComponent(q)}`)).map(thread => thread.id)
      const kept = await emailThread({ subject: `ØL OG ÆBLER ÅBNER ${marker}` })
      const erased = await emailThread({ subject: `ÅBENT HUS ${marker}` })
      await as(admin).json('POST', inboxApi.admin.contactErase((await detail(admin, erased)).contact.id))
      expect((await detail(admin, erased)).thread.anonymisedAt).toBeTruthy()

      const sqlite = fixtureSqlite(`${dataDir}/db/sqlite.db`)
      // The backfill of the migration that added the column (sqlite's lower() keeps Æ, Ø and Å), and a value an
      // anonymised thread must never keep.
      sqlite.exec('update inbox_threads set searchText = lower(coalesce(subject, \'\')) where id = ?', kept)
      sqlite.exec('update inbox_threads set searchText = ? where id = ?', `åbent hus ${marker}`, erased)
      expect(await found(`øl og æbler åbner ${marker}`)).toEqual([])

      const first = reindexOf(await runSearchReindex(), 'inbox_threads')!
      expect(first.updated).toBeGreaterThanOrEqual(2)
      const stored = (id: string) => sqlite.query<{ searchText: string }>('select searchText from inbox_threads where id = ?', id)[0]!.searchText
      expect(stored(kept)).toBe(`øl og æbler åbner ${marker}`)
      expect(stored(erased)).toBe('')
      expect(await found(`øl og æbler åbner ${marker}`)).toEqual([kept])
      expect(await found(`åbent hus ${marker}`)).toEqual([])

      expect(reindexOf(await runSearchReindex(), 'inbox_threads')).toEqual({ ...first, updated: 0 })
    })

    it('lists everybody a thread can be assigned to: the people with access to its mailbox', async () => {
      const threadId = await emailThread()
      const ids = async (session: Session, query = '') => (await as(session).json<Json[]>('GET', `${inboxApi.admin.assignees(threadId)}${query}`)).map(person => person.id)
      // Support is read by coordinators and up (coord, dpo, admin) and by wild, which manages every mailbox; not crew.
      const everyone = await ids(coord)
      expect(everyone).toEqual(expect.arrayContaining([coord.id, admin.id, wild.id, dpo.id]))
      expect(everyone).not.toContain(crew.id)
      expect(await ids(coord, '?q=Wild')).toEqual([wild.id])
      // Anyone listed can be assigned.
      expect((await as(coord).json<Json>('PATCH', inboxApi.admin.thread(threadId), { assigneeId: dpo.id })).assigneeId).toBe(dpo.id)

      // A thread hidden below admin lists only those who hold admin (and nobody else is listed for it).
      await as(admin).json('POST', inboxApi.admin.hide(threadId), { role: 'admin' })
      const hiddenFor = await ids(admin)
      expect(hiddenFor).toContain(admin.id)
      expect(hiddenFor).not.toContain(coord.id)
      expect(hiddenFor).not.toContain(dpo.id)
      expect(hiddenFor).not.toContain(wild.id)

      // 401 and 403 come before the 404 of a thread the caller cannot read.
      await expectApiError(as().json('GET', inboxApi.admin.assignees(threadId)), 401)
      await expectApiError(as(crew).json('GET', inboxApi.admin.assignees(threadId)), 403, 'forbidden')
      await expectApiError(as(coord).json('GET', inboxApi.admin.assignees(threadId)), 404, 'not_found')
    })
  })

  describe('personal data', () => {
    it('shows contact details with inbox:pii only, and inbox:* does not reach them', async () => {
      const threadId = await emailThread()
      expect((await detail(admin, threadId)).contact.email).toMatch(/@example\.org$/)
      const forCoord = await detail(coord, threadId)
      expect(forCoord.contact).not.toHaveProperty('email')
      expect(forCoord.contact.name).toBe('Kari Nordmann')
      expect(forCoord.can).toMatchObject({ reply: true, assign: true, hide: true, pii: false, audit: false, erase: false })
      expect((await threadsOf(coord)).find(thread => thread.id === threadId)!.contact).not.toHaveProperty('email')

      // `inbox:*` covers `inbox:manage` (every mailbox), never `inbox:pii` or `inbox-audit:pii`.
      const forWild = await detail(wild, threadId)
      expect(forWild.contact).not.toHaveProperty('email')
      await expectApiError(as(wild).json('GET', inboxApi.admin.audit), 403, 'forbidden')
      await expectApiError(as(wild).json('GET', inboxApi.admin.contactExport(forWild.contact.id)), 403, 'forbidden')
      await expectApiError(as(coord).json('GET', inboxApi.admin.audit), 403, 'forbidden')
    })

    it('logs views, replies and assignments for admins', async () => {
      const threadId = await emailThread()
      await detail(coord, threadId)
      await detail(coord, threadId)
      await as(coord).json('POST', inboxApi.admin.messages(threadId), { body: 'Looking into it.' })
      const log = await as(admin).json<Json>('GET', `${inboxApi.admin.audit}?threadId=${threadId}`)
      const actions = (log.items as Json[]).map(entry => [entry.action, entry.actorId])
      // A repeated view within 15 minutes is one entry.
      expect(actions).toEqual(expect.arrayContaining([['viewed', coord.id], ['replied', coord.id]]))
      expect(actions.filter(([action]) => action === 'viewed')).toHaveLength(1)
    })

    it('records another module\'s action on the thread (inbox:thread:linked) only for someone who can read it', async () => {
      const threadId = await emailThread()
      await as(coord).json('POST', '/api/test/link', { threadId, label: 'Summer crew' })
      await as(crew).json('POST', '/api/test/link', { threadId, label: 'Not allowed' })
      const log = await as(admin).json<Json>('GET', `${inboxApi.admin.audit}?threadId=${threadId}&action=linked`)
      expect(log.items).toEqual([expect.objectContaining({ action: 'linked', actorId: coord.id, data: expect.objectContaining({ module: 'crew', kind: 'crew-member', label: 'Summer crew', userId: 42 }) })])
    })

    it('exports a contact without the internal notes, and erases them', async () => {
      const exportedEmail = email({ text: 'My phone is 12345678' })
      const threadId = (await (await postEmail(exportedEmail)).json() as Json).threadId as string
      await as(coord).json('POST', inboxApi.admin.notes(threadId), { body: 'Internal: VIP' })
      await as(coord).json('POST', inboxApi.admin.messages(threadId), { body: 'Thanks!' })
      const { contact } = await detail(admin, threadId)

      const exported = await as(admin).json<Json>('GET', inboxApi.admin.contactExport(contact.id))
      expect(exported.contact).toMatchObject({ id: contact.id, email: contact.email, name: 'Kari Nordmann' })
      expect(exported.threads[0].messages.map((message: Json) => message.body)).toEqual(['My phone is 12345678', 'Thanks!'])
      expect(JSON.stringify(exported)).not.toContain('Internal: VIP')

      await expectApiError(as(coord).json('POST', inboxApi.admin.contactErase(contact.id)), 403, 'forbidden')
      const erased = await as(admin).json<Json>('POST', inboxApi.admin.contactErase(contact.id))
      expect(erased).toMatchObject({ id: contact.id, name: null, email: null, phone: null, externalId: null, threads: 1 })
      expect(erased.erasedAt).toBeTruthy()
      const after = await detail(admin, threadId)
      expect(after.messages.every((message: Json) => message.body === '')).toBe(true)
      expect(after.thread).toMatchObject({ status: 'closed', subject: null })
      expect(after.thread.anonymisedAt).toBeTruthy()
      // The provider ids are gone, but tombstoned: the same email delivered again does not bring it back.
      expect(await (await postEmail(exportedEmail)).json()).toEqual({ status: 'ignored', reason: 'removed' })
      // A new email from the same person is a new message of a new contact.
      const again = await (await postEmail(email({ from: exportedEmail.from, text: 'Me again' }))).json() as Json
      expect(again.status).toBe('received')
      expect(again.threadId).not.toBe(threadId)
      expect((await detail(admin, again.threadId)).contact.id).not.toBe(contact.id)
      await expectApiError(as(admin).json('POST', inboxApi.admin.messages(threadId), { body: 'Hello?' }), 409, 'channel_unavailable')
      const log = await as(admin).json<Json>('GET', `${inboxApi.admin.audit}?contactId=${contact.id}`)
      expect((log.items as Json[]).map(entry => entry.action).sort()).toEqual(['erased', 'exported'])
    })
  })

  describe('personal data across mailboxes and hidden threads', () => {
    let contactId: string
    let supportThread: string
    let boardThread: string

    it('refuses to export a contact with threads in a mailbox the caller does not read', async () => {
      const from = { email: `split${++counter}@example.org`, name: 'Split Person' }
      supportThread = await emailThread({ from, text: 'To support' })
      boardThread = (await (await postEmail(email({ from, to: 'board@inbox.test', text: 'To the board' }))).json() as Json).threadId
      contactId = (await detail(admin, supportThread)).contact.id
      expect((await detail(admin, boardThread)).contact.id).toBe(contactId)

      // The privacy officer holds inbox:pii but reads only the support mailbox: a partial export would answer the access
      // request incompletely, so it is refused, as an erase is. Someone who reads both mailboxes exports everything.
      const refused = await as(dpo).fetch('GET', inboxApi.admin.contactExport(contactId))
      expect(refused.status).toBe(409)
      const refusal = await refused.text()
      expect(refusal).toContain('contact_threads_hidden')
      expect(refusal).not.toContain('To the board')
      expect(refusal).not.toContain('To support')
      const forAdmin = await as(admin).json<Json>('GET', inboxApi.admin.contactExport(contactId))
      expect(forAdmin.threads.map((item: Json) => item.thread.id).sort()).toEqual([supportThread, boardThread].sort())

      // A contact whose every thread is out of reach is the same 404 as an unknown one.
      const boardOnly = (await (await postEmail(email({ to: 'board@inbox.test' }))).json() as Json).threadId
      const boardContact = (await detail(admin, boardOnly)).contact.id
      await expectApiError(as(dpo).json('GET', inboxApi.admin.contactExport(boardContact)), 404, 'not_found')
      await expectApiError(as(dpo).json('GET', inboxApi.admin.contactExport('icn_00000000000000000000000000000000')), 404, 'not_found')
    })

    it('filters the audit log by mailbox access and hidden threads', async () => {
      await detail(admin, boardThread)
      await detail(dpo, supportThread)
      const entries = async (session: Session, query: string) => (await as(session).json<Json>('GET', `${inboxApi.admin.audit}?pageSize=100&${query}`)).items as Json[]
      expect((await entries(admin, `threadId=${boardThread}`)).map(entry => entry.action)).toContain('viewed')
      expect(await entries(dpo, `threadId=${boardThread}`)).toEqual([])
      expect((await entries(dpo, `threadId=${supportThread}`)).map(entry => entry.action)).toContain('viewed')
      expect((await entries(dpo, '')).some(entry => entry.threadId === boardThread)).toBe(false)
      // An export of a contact with a thread the caller reads is listed; retention runs of mailboxes they do not read are not.
      expect((await entries(dpo, `contactId=${contactId}`)).map(entry => entry.action)).toContain('exported')

      // Hidden below a role the caller lacks: the thread's entries go from their log too.
      await as(admin).json('POST', inboxApi.admin.hide(supportThread), { role: 'admin' })
      expect(await entries(dpo, `threadId=${supportThread}`)).toEqual([])
      expect((await entries(admin, `threadId=${supportThread}`)).map(entry => entry.action)).toContain('hidden')
      await as(admin).json('POST', inboxApi.admin.hide(supportThread), { role: null })
    })

    it('refuses to export or erase a contact with threads hidden from the caller', async () => {
      // wild hides the support thread below its own role, which admin does not hold.
      await as(wild).json('POST', inboxApi.admin.hide(supportThread), { role: 'wild' })
      // A thread hidden below a role the caller lacks stops an export too, and the refusal holds nothing of the contact.
      await expectApiError(as(admin).json('GET', inboxApi.admin.contactExport(contactId)), 409, 'contact_threads_hidden')
      await expectApiError(as(admin).json('POST', inboxApi.admin.contactErase(contactId)), 409, 'contact_threads_hidden')
      expect((await detail(admin, boardThread)).messages[0].body).toBe('To the board')
      // Without inbox:manage there is no erase at all.
      await expectApiError(as(dpo).json('POST', inboxApi.admin.contactErase(contactId)), 403, 'forbidden')

      await as(wild).json('POST', inboxApi.admin.hide(supportThread), { role: null })
      expect((await as(admin).json<Json>('GET', inboxApi.admin.contactExport(contactId))).threads).toHaveLength(2)
      const erased = await as(admin).json<Json>('POST', inboxApi.admin.contactErase(contactId))
      expect(erased).toMatchObject({ id: contactId, threads: 2 })
    })
  })

  describe('tokens', () => {
    it('never exposes platform mailboxes to API tokens: every route is session only', async () => {
      // No inbox permission can be put on a token at all.
      await expectApiError(as(admin).json('POST', '/api/auth/me/tokens', { name: 'inbox', scopes: ['inbox:read'] }), 400, 'unknown_scope')
      // A token with every scope its user may grant still gets nothing from the inbox.
      const token = await createToken(admin.cookie, ['*'])
      const threadId = (await threadsOf(admin))[0]!.id
      await expectApiError(bearer(token).json('GET', inboxApi.admin.threads), 403, 'session_required')
      await expectApiError(bearer(token).json('GET', inboxApi.admin.thread(threadId)), 403, 'session_required')
      await expectApiError(bearer(token).json('GET', inboxApi.admin.mailboxes), 403, 'session_required')
      await expectApiError(bearer(token).json('POST', inboxApi.admin.messages(threadId), { body: 'x' }), 403, 'session_required')
      const contactId = (await detail(admin, threadId)).contact.id
      await expectApiError(bearer(token).json('GET', inboxApi.admin.contactExport(contactId)), 403, 'session_required')
      await expectApiError(bearer(token).json('POST', inboxApi.admin.contactErase(contactId)), 403, 'session_required')
      await expectApiError(apiClient({ bearer: 'not-a-token' }).json('GET', inboxApi.admin.threads), 401)
    })
  })

  describe('retention', () => {
    it('deletes closed threads past their mailbox\'s retention, and leaves the rest', async () => {
      const old = await emailThread()
      const recent = await emailThread()
      const stillOpen = await emailThread()
      const boardOld = await (await postEmail(email({ to: 'board@inbox.test' }))).json() as Json
      for (const id of [old, recent, boardOld.threadId]) await as(admin).json('PATCH', inboxApi.admin.thread(id), { status: 'closed' })
      await backdate(old, 40)
      await backdate(recent, 5)
      await backdate(stillOpen, 400)
      await backdate(boardOld.threadId, 40)

      const { result } = await runRetention(new Date())
      expect(result.threads).toBeGreaterThanOrEqual(1)
      await expectApiError(as(admin).json('GET', inboxApi.admin.thread(old)), 404)
      expect((await detail(admin, recent)).thread.id).toBe(recent)
      expect((await detail(admin, stillOpen)).thread.id).toBe(stillOpen)
      // The board mailbox keeps closed threads for 365 days.
      expect((await detail(admin, boardOld.threadId)).thread.id).toBe(boardOld.threadId)

      // A run a year later catches up with the board thread too.
      const later = await runRetention(new Date(Date.now() + 400 * 24 * 60 * 60 * 1000))
      expect(later.result.threads).toBeGreaterThanOrEqual(2)
      await expectApiError(as(admin).json('GET', inboxApi.admin.thread(boardOld.threadId)), 404)
      await expectApiError(as(admin).json('GET', inboxApi.admin.thread(recent)), 404)
      expect((await detail(admin, stillOpen)).thread.status).toBe('open')
      const log = await as(admin).json<Json>('GET', `${inboxApi.admin.audit}?action=retention`)
      expect(log.total).toBeGreaterThanOrEqual(2)
    })
  })

  describe('retention, anonymise mode', () => {
    it('blanks old closed threads, keeps them, and erases contacts left with nothing', async () => {
      const threadId = await emailThread()
      const { contact } = await detail(admin, threadId)
      await as(admin).json('PATCH', inboxApi.admin.thread(threadId), { status: 'closed' })
      await backdate(threadId, 40)
      const { result } = await runRetention(new Date(), 'anonymise')
      expect(result).toMatchObject({ mode: 'anonymise' })
      expect(result.threads).toBeGreaterThanOrEqual(1)
      const after = await detail(admin, threadId)
      expect(after.thread).toMatchObject({ status: 'closed', subject: null })
      expect(after.thread.anonymisedAt).toBeTruthy()
      expect(after.messages.every((message: Json) => message.body === '')).toBe(true)
      expect(after.contact).toMatchObject({ id: contact.id, name: null, email: null })
      expect(after.contact.erasedAt).toBeTruthy()
      // A second run finds nothing new to blank.
      expect((await runRetention(new Date(), 'anonymise')).result.threads).toBe(0)
    })

    it('starts a new thread for an answer to an anonymised thread', async () => {
      const from = { email: `anon${++counter}@example.org`, name: 'Anon Person' }
      const old = await emailThread({ from, subject: 'Old question' })
      await as(admin).json('PATCH', inboxApi.admin.thread(old), { status: 'closed' })
      const live = await emailThread({ from, subject: 'New question' })
      expect(live).not.toBe(old)
      await backdate(old, 40)
      await runRetention(new Date(), 'anonymise')
      expect((await detail(admin, old)).thread.anonymisedAt).toBeTruthy()

      // The person still has a live thread, so their contact stays; their answer to the old one starts a new thread.
      const answer = await (await postEmail(email({ from, subject: `Re: Old question [${old}]`, text: 'About the old one' }))).json() as Json
      expect(answer.status).toBe('received')
      expect([old, live]).not.toContain(answer.threadId)
      const blanked = await detail(admin, old)
      expect(blanked.messages.every((message: Json) => message.body === '')).toBe(true)
      expect(blanked.thread.status).toBe('closed')
    })
  })

  describe('replays after retention', () => {
    it('ignores a webhook replayed after retention removed its message, until the tombstone is pruned', async () => {
      const day = 24 * 60 * 60 * 1000
      const payload = email({ text: 'Replay me' })
      const stored = await (await postEmail(payload)).json() as Json
      const wamid = `wamid.replay.${++counter}`
      expect(await (await postMeta(whatsapp(wamid, '4529999999', 'Replay me too'))).json()).toMatchObject({ received: 1 })
      const [whatsappThread] = (await threadsOf(admin, '&channel=whatsapp&status=all')).filter(thread => thread.preview === 'Replay me too')
      for (const id of [stored.threadId, whatsappThread!.id]) {
        await as(admin).json('PATCH', inboxApi.admin.thread(id), { status: 'closed' })
        await backdate(id, 40)
      }
      await runRetention(new Date())
      await expectApiError(as(admin).json('GET', inboxApi.admin.thread(stored.threadId)), 404)
      await expectApiError(as(admin).json('GET', inboxApi.admin.thread(whatsappThread!.id)), 404)

      // The provider retries, or someone replays the signed request: nothing comes back.
      expect(await (await postEmail(payload)).json()).toEqual({ status: 'ignored', reason: 'removed' })
      expect(await (await postMeta(whatsapp(wamid, '4529999999', 'Replay me too'))).json()).toEqual({ received: 0, duplicates: 0, ignored: 1, failed: 0 })
      expect((await threadsOf(admin, '&status=all')).some(thread => thread.preview === 'Replay me' || thread.preview === 'Replay me too')).toBe(false)

      // Still remembered 300 days later; a run 400 days later prunes it (retention.tombstoneDays is 365).
      await runRetention(new Date(Date.now() + 300 * day))
      expect(await (await postEmail(payload)).json()).toEqual({ status: 'ignored', reason: 'removed' })
      await runRetention(new Date(Date.now() + 400 * day))
      expect((await (await postEmail(payload)).json() as Json).status).toBe('received')
    })

    it('keeps the tombstones of an erased contact for good, also of what retention removed before', async () => {
      const day = 24 * 60 * 60 * 1000
      const from = { email: `forgotten${++counter}@example.org`, name: 'Forgotten' }
      const removedPayload = email({ from, text: 'Removed by retention' })
      const removed = (await (await postEmail(removedPayload)).json() as Json).threadId as string
      await as(admin).json('PATCH', inboxApi.admin.thread(removed), { status: 'closed' })
      const erasedPayload = email({ from, text: 'Erased with the contact' })
      const live = (await (await postEmail(erasedPayload)).json() as Json).threadId as string
      expect(live).not.toBe(removed)
      await backdate(removed, 40)
      await runRetention(new Date())
      await expectApiError(as(admin).json('GET', inboxApi.admin.thread(removed)), 404)

      const { contact } = await detail(admin, live)
      await as(admin).json('POST', inboxApi.admin.contactErase(contact.id))
      // Far past `retention.tombstoneDays`: retention's own tombstones are gone by now, an erase's never go.
      await runRetention(new Date(Date.now() + 800 * day))
      for (const payload of [removedPayload, erasedPayload]) {
        expect(await (await postEmail(payload)).json()).toEqual({ status: 'ignored', reason: 'removed' })
      }
    })
  })

  describe('retention budget', () => {
    it('gives every mailbox its share of a run, so one busy mailbox never starves the rest', async () => {
      // The board mailbox comes first and has a backlog; the support mailbox has one expired thread.
      const boardThreads: string[] = []
      for (let i = 0; i < 3; i++) boardThreads.push((await (await postEmail(email({ to: 'board@inbox.test' }))).json() as Json).threadId)
      const supportThread = await emailThread()
      for (const id of [...boardThreads, supportThread]) {
        await as(admin).json('PATCH', inboxApi.admin.thread(id), { status: 'closed' })
        await backdate(id, 1000)
      }
      const readable = async (ids: string[]) => (await Promise.all(ids.map(id => as(admin).fetch('GET', inboxApi.admin.thread(id))))).filter(response => response.ok).length

      const { result } = await runRetention(new Date(), 'delete', 2)
      expect(result).toMatchObject({ threads: 2, mailboxes: 2, more: true })
      expect(await readable([supportThread])).toBe(0)
      expect(await readable(boardThreads)).toBe(2)

      // The next run works off the rest.
      const next = await runRetention(new Date(), 'delete', 10)
      expect(next.result).toMatchObject({ threads: 2, more: false })
      expect(await readable(boardThreads)).toBe(0)
    })
  })

  describe('channels fail closed', () => {
    // Every inbound route needs its secret: without one it answers 501 `not_configured` before reading the request,
    // never an unauthenticated default. The secrets are switched off per request through the environment override.
    it('refuses inbound email without a webhook secret', async () => {
      await withServerEnv('NUXT_INBOX_EMAIL_WEBHOOK_SECRET', '', async () => {
        // Signed with the secret that was configured before, and unsigned: both refused.
        await expectApiError(postEmail(email()), 501, 'not_configured')
        await expectApiError(postEmail(email(), null), 501, 'not_configured')
      })
      expect((await postEmail(email())).status).toBe(200)
    })

    it('refuses WhatsApp, Messenger and Instagram messages without the Meta app secret', async () => {
      await withServerEnv('NUXT_INBOX_META_APP_SECRET', '', async () => {
        await expectApiError(postMeta(whatsapp('wamid.closed', '4520000000', 'Closed door')), 501, 'not_configured')
        await expectApiError(postMeta({ object: 'instagram', entry: [] }, null), 501, 'not_configured')
      })
      expect((await threadsOf(admin, '&channel=whatsapp&status=all')).some(thread => thread.preview === 'Closed door')).toBe(false)
    })

    it('refuses the Meta subscription check without a verify token', async () => {
      await withServerEnv('NUXT_INBOX_META_VERIFY_TOKEN', '', async () => {
        await expectApiError(fetch(`${inboxApi.webhooks.meta}?hub.mode=subscribe&hub.verify_token=&hub.challenge=1`), 501, 'not_configured')
      })
    })

    it('refuses a module channel\'s webhook without its inbound secret', async () => {
      const post = () => fetch(inboxApi.webhooks.channel('test.fake'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-fake-token': '' },
        body: JSON.stringify({ to: 'fake-1', from: 'closed-user', id: 'closed-1', text: 'Let me in' }),
      })
      await withServerEnv('NUXT_INBOX_SECRETS_FAKE_WEBHOOK', '', async () => {
        // An empty token would match an empty secret: the inbox never asks the adapter.
        await expectApiError(post(), 501, 'not_configured')
      })
      await expectApiError(post(), 401)
      expect((await threadsOf(admin, '&channel=test.fake&status=all')).some(thread => thread.contact?.externalId === 'closed-user')).toBe(false)
    })

    it('has no open route for the contact form or the Meta channels', async () => {
      // The contact form comes in through forms' own submit (its access rules and `forms:submitted`), the Meta channels
      // through the signed Meta webhook. `email` has its own signed route at the same path.
      for (const channel of ['form', 'email', 'whatsapp', 'messenger', 'instagram']) {
        const response = await fetch(inboxApi.webhooks.channel(channel), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'contact', from: 'x', id: 'x', text: 'x' }) })
        expect(response.status, channel).toBe(channel === 'email' ? 401 : 404)
      }
    })
  })

  // `reply.test` is the fixture's inbox domain (`inbox.email.domains`); the other tests' addresses are on no inbox domain.
  describe('two-way email on an inbox domain', () => {
    let mailbox: Json
    let account: Json
    const help = 'help@reply.test'
    const sentAt = async (index = -1) => (await getEmails()).at(index)! as Json

    it('lists the inbox domains and the email drivers to admins', async () => {
      mailbox = await as(admin).json<Json>('POST', inboxApi.admin.mailboxes, { key: 'two-way', name: { da: 'Tovejs', en: 'Two-way' }, grants: [{ kind: 'role', role: 'admin' }] })
      account = await as(admin).json<Json>('POST', inboxApi.admin.channels, { mailboxId: mailbox.id, channel: 'email', address: help })
      expect(await as(admin).json<Json>('GET', inboxApi.admin.email)).toEqual({ domains: ['reply.test'], drivers: ['cloudflare', 'resend', 'gmail', 'imap'] })
      await expectApiError(as(coord).json('GET', inboxApi.admin.email), 403, 'forbidden')
    })

    it('replies with the thread\'s reply address and the In-Reply-To of the person\'s email', async () => {
      const first = email({ to: help })
      const threadId = await emailThread(first)
      await as(admin).json('POST', inboxApi.admin.messages(threadId), { body: 'We are on it.' })
      const sent = await sentAt()
      expect(sent.replyTo).toBe(`help+${threadId}@reply.test`)
      expect(sent.headers).toEqual({ 'In-Reply-To': first.messageId, 'References': first.messageId })
      expect(sent.subject).toBe(`Re: Where is my ticket? [${threadId}]`)
      expect(sent).not.toHaveProperty('from')
    })

    /** Two open threads of one person: `older` (authenticated) and a newer one their latest open thread would pick. */
    async function twoThreads() {
      const from = { email: `two${++counter}@example.org`, name: 'Two Threads' }
      const firstEmail = email({ to: help, from })
      const older = await emailThread(firstEmail)
      const newer = await emailThread(email({ to: help, from, subject: 'Something else', authenticated: false }))
      expect(newer).not.toBe(older)
      // The newer thread is the person's latest open one (times are stored to the second): a plain answer joins it.
      await backdate(older, 1)
      const plain = await (await postEmail(email({ to: help, from, subject: 'No marker at all' }))).json() as Json
      expect(plain.threadId).toBe(newer)
      return { from, older, newer, firstEmail }
    }

    it('joins the thread its reply address names, whatever the subject', async () => {
      const { from, older } = await twoThreads()
      const answer = await (await postEmail(email({ to: `help+${older}@reply.test`, from, subject: 'A brand new subject' }))).json() as Json
      expect(answer.threadId).toBe(older)
      expect((await detail(admin, older)).messages.at(-1).body).toBe('Hello, I never got my ticket.')
    })

    it('joins the thread of the email it answers by References alone', async () => {
      const { from, older, firstEmail } = await twoThreads()
      const answer = await (await postEmail(email({ to: help, from, subject: 'Changed subject', references: [`<unknown@elsewhere>`, firstEmail.messageId] }))).json() as Json
      expect(answer.threadId).toBe(older)
    })

    it('never lets another sender, or an unverified one, into a thread by its reply address', async () => {
      const threadId = await emailThread(email({ to: help }))
      const stranger = await (await postEmail(email({ to: `help+${threadId}@reply.test` }))).json() as Json
      expect(stranger.status).toBe('received')
      expect(stranger.threadId).not.toBe(threadId)
      const { contact } = await detail(admin, threadId)
      const forged = await (await postEmail(email({ to: `help+${threadId}@reply.test`, from: { email: contact.email }, authenticated: false }))).json() as Json
      expect(forged.threadId).not.toBe(threadId)
      expect((await detail(admin, threadId)).messages).toHaveLength(1)
    })

    it('ignores an address on an inbox domain that no account has', async () => {
      expect(await (await postEmail(email({ to: 'nobody@reply.test' }))).json()).toEqual({ status: 'ignored', reason: 'no_account' })
      expect(await (await postEmail(email({ to: 'nobody+ibt_0123456789abcdef@reply.test' }))).json()).toEqual({ status: 'ignored', reason: 'no_account' })
    })

    it('sends from the account\'s address with the mailbox name when sendFromAddress is on', async () => {
      await as(admin).json('PATCH', inboxApi.admin.channel(account.id), { config: { sendFromAddress: true } })
      try {
        const threadId = await emailThread(email({ to: help }))
        await as(admin).json('POST', inboxApi.admin.messages(threadId), { body: 'From us.' })
        expect((await sentAt()).from).toBe('"Two-way" <help@reply.test>')
      }
      finally {
        await as(admin).json('PATCH', inboxApi.admin.channel(account.id), { config: {} })
      }
    })

    it('answers a contact form thread of the mailbox with the thread\'s reply address', async () => {
      await as(admin).json('POST', formsApi.admin.forms, {
        slug: 'two-way-contact',
        name: 'Two-way contact',
        status: 'published',
        definition: {
          mode: 'single',
          storage: 'db',
          access: { availability: 'web', auth: 'none' },
          steps: [{ id: 'main', fields: [
            { key: 'name', type: 'text', required: true, label: 'Name' },
            { key: 'email', type: 'email', required: true, label: 'Email' },
            { key: 'message', type: 'textarea', required: true, label: 'Message' },
          ] }],
        },
      })
      await as(admin).json('POST', inboxApi.admin.channels, { mailboxId: mailbox.id, channel: 'form', address: 'two-way-contact' })
      await as().json('POST', formsApi.submit('two-way-contact'), { answers: { name: 'Form Person', email: 'form.person@example.org', message: 'Hello from the form' }, locale: 'en' })
      const [thread] = (await threadsOf(admin, '&channel=form&status=all')).filter(item => item.mailboxId === mailbox.id)
      await as(admin).json('POST', inboxApi.admin.messages(thread!.id), { body: 'Thanks for writing.' })
      const sent = await sentAt()
      expect(sent).toMatchObject({ to: 'form.person@example.org', replyTo: `help+${thread!.id}@reply.test` })
      // The person answers our reply from their mail client: the reply address and the In-Reply-To of our Message-ID.
      const answer = await (await postEmail(email({ to: `help+${thread!.id}@reply.test`, from: { email: 'form.person@example.org' }, subject: 'Re: thanks', inReplyTo: `<${sent.sentMessageId}>` }))).json() as Json
      expect(answer.threadId).toBe(thread!.id)
    })

    it('threads an answer by the Message-ID of our reply alone', async () => {
      const from = { email: `ours${++counter}@example.org`, name: 'Ours' }
      const threadId = await emailThread(email({ to: help, from }))
      await as(admin).json('POST', inboxApi.admin.messages(threadId), { body: 'Our reply.' })
      const sent = await sentAt()
      expect(sent.sentMessageId).toMatch(/@reply\.test$/)
      // A newer open thread of the person, which an answer without headers would join.
      const newer = await emailThread(email({ to: help, from, subject: 'Unrelated', authenticated: false }))
      await backdate(threadId, 1)
      const answer = await (await postEmail(email({ to: help, from, subject: 'No marker', inReplyTo: `<${sent.sentMessageId}>` }))).json() as Json
      expect(answer.threadId).toBe(threadId)
      expect(answer.threadId).not.toBe(newer)
    })

    it('keeps the inbound driver webhooks closed without their secrets, and the internal ones internal', async () => {
      await expectApiError(fetch(inboxApi.webhooks.emailDriver('resend'), { method: 'POST', body: '{}' }), 501)
      await expectApiError(fetch(inboxApi.webhooks.emailDriver('gmail'), { method: 'POST', body: '{}' }), 501)
      expect((await fetch(inboxApi.webhooks.emailDriver('imap'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(404)
      expect((await fetch(inboxApi.webhooks.emailDriver('cloudflare'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(404)
      expect((await fetch(inboxApi.webhooks.emailDriver('postmark'), { method: 'POST', body: '{}' })).status).toBe(404)
    })
  })

  describe('pages', () => {
    it('renders the staff pages', async () => {
      for (const path of ['/admin/inbox', '/admin/inbox/settings']) {
        const response = await fetch(path, { headers: { cookie: admin.cookie } })
        expect(response.status, path).toBe(200)
      }
    })
  })
})
