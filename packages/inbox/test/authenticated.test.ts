import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import { formsApi } from '@frigear-nu/forms/api'
import { inboxApi } from '../src/runtime/utils/api'
import { backdate, createToken, getEmails, getHooks, getSent, makeLead, postEmail, postMeta, registerUser, runRetention } from './helpers'
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

  await setup({ rootDir, dev: true, serverStartTimeout: 240_000, setupTimeout: 300_000 })

  let admin: Session
  let coord: Session
  let crew: Session
  let wild: Session
  let support: Json
  let board: Json

  beforeAll(async () => {
    admin = await registerUser('Admin', 'admin.test')
    coord = await registerUser('Coord', 'coord.test')
    crew = await registerUser('Crew', 'crew.test')
    wild = await registerUser('Wild', 'wild.test')
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
      expect(support).toMatchObject({ ownerType: 'platform', visibility: { globalRoles: ['coordinator'] } })
      expect(board.retentionDays).toBe(365)
      expect((await as(coord).json<Json[]>('GET', inboxApi.admin.mailboxes)).map(mailbox => mailbox.key)).toEqual(['support'])
      expect(await as(crew).json<Json[]>('GET', inboxApi.admin.mailboxes)).toEqual([])
      await expectApiError(as().json('GET', inboxApi.admin.mailboxes), 401)
      await expectApiError(as(crew).json('GET', inboxApi.admin.mailbox(board.id)), 404, 'not_found')
    })

    it('never makes a platform mailbox open to every signed-in user, and only staff manage them', async () => {
      await expectApiError(as(admin).json('POST', inboxApi.admin.mailboxes, { key: 'open', name: 'Open' }), 400)
      await expectApiError(as(admin).json('POST', inboxApi.admin.mailboxes, { key: 'public', name: 'Public', visibility: { public: true } }), 400)
      await expectApiError(as(admin).json('POST', inboxApi.admin.mailboxes, { key: 'typo', name: 'Typo', visibility: { permission: 'inbox:read' } }), 400)
      await expectApiError(as(coord).json('POST', inboxApi.admin.mailboxes, { key: 'x', name: 'X', visibility: { globalRoles: ['crew'] } }), 403, 'forbidden')
      await expectApiError(as(admin).json('POST', inboxApi.admin.mailboxes, { key: 'support', name: 'Again', visibility: { globalRoles: ['crew'] } }), 409)
      const renamed = await as(admin).json<Json>('PATCH', inboxApi.admin.mailbox(board.id), { name: { da: 'Bestyrelse', en: 'Board' } })
      expect(renamed.name).toEqual({ da: 'Bestyrelse', en: 'Board' })
    })

    it('lets a team\'s leads read a team mailbox', async () => {
      await expectApiError(as(admin).json('POST', inboxApi.admin.mailboxes, { key: 'ghost-team', name: 'Ghost', ownerType: 'team', ownerId: 'tem_missing' }), 400)
      const team = await as(admin).json<Json>('POST', inboxApi.admin.mailboxes, { key: 'bar-team', name: 'Bar team', ownerType: 'team', ownerId: 'tem_known' })
      expect(team.visibility).toBeNull()
      expect(await as(crew).json<Json[]>('GET', inboxApi.admin.mailboxes)).toEqual([])
      await makeLead(crew.cookie, 'tem_known')
      expect((await as(crew).json<Json[]>('GET', inboxApi.admin.mailboxes)).map(mailbox => mailbox.key)).toEqual(['bar-team'])
      // An empty mailbox can go; the support mailbox keeps its threads and cannot.
      const spare = await as(admin).json<Json>('POST', inboxApi.admin.mailboxes, { key: 'spare', name: 'Spare', visibility: { globalRoles: ['admin'] } })
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
      const token = await createToken(admin.cookie, ['inbox'])
      await expectApiError(bearer(token).json('GET', inboxApi.admin.channels), 403, 'session_required')
      await expectApiError(bearer(token).json('POST', inboxApi.admin.channels, { mailboxId: support.id, channel: 'email', address: 'z@inbox.test' }), 403, 'session_required')
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
  })

  describe('meta webhook', () => {
    it('answers the subscription check with the verify token only', async () => {
      const ok = await fetch(`${inboxApi.webhooks.meta}?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=12345`)
      expect(ok.status).toBe(200)
      expect(await ok.text()).toBe('12345')
      const wrong = await fetch(`${inboxApi.webhooks.meta}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345`)
      expect(wrong.status).toBe(403)
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
      expect(thread).toMatchObject({ subject: 'Volunteering', preview: 'Can I help at the bar?', contact: { name: 'Lise', email: 'lise@example.org' } })

      await as(admin).json('POST', inboxApi.admin.messages(thread!.id), { body: 'Yes, welcome!' })
      const sent = (await getEmails()).at(-1)!
      expect(sent).toMatchObject({ to: 'lise@example.org', replyTo: 'support@inbox.test', text: 'Yes, welcome!' })
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
      expect((await getHooks()).filter(hook => hook.threadId === threadId && hook.name === 'thread:assigned').map(hook => hook.data)).toEqual([{ assigneeId: coord.id, previous: null }])
      await expectApiError(as(coord).json('PATCH', inboxApi.admin.thread(threadId), { assigneeId: 999_999 }), 400)
      expect((await threadsOf(coord, '&assignee=me')).map(thread => thread.id)).toContain(threadId)
      const summary = await as(coord).json<Json>('GET', inboxApi.admin.summary)
      expect(summary.mine).toBeGreaterThanOrEqual(1)
      expect(summary.mailboxes).toBe(1)

      const closed = await as(coord).json<Json>('PATCH', inboxApi.admin.thread(threadId), { status: 'closed' })
      expect(closed.status).toBe('closed')
      expect((await getHooks()).filter(hook => hook.threadId === threadId && hook.name === 'thread:status-changed').map(hook => hook.data)).toEqual([{ from: 'open', to: 'closed' }])
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
      await expectApiError(as(admin).json('PATCH', inboxApi.admin.thread(threadId), { assigneeId: coord.id }), 400)

      const shown = await as(admin).json<Json>('POST', inboxApi.admin.hide(threadId), { role: null })
      expect(shown.hiddenBelow).toBeNull()
      expect((await detail(coord, threadId)).thread.id).toBe(threadId)
      await expectApiError(as(crew).json('POST', inboxApi.admin.hide(threadId), { role: null }), 403, 'forbidden')
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

    it('exports a contact without the internal notes, and erases them', async () => {
      const threadId = await emailThread({ text: 'My phone is 12345678' })
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
      expect(after.thread.anonymisedAt).toBeTruthy()
      await expectApiError(as(admin).json('POST', inboxApi.admin.messages(threadId), { body: 'Hello?' }), 409, 'channel_unavailable')
      const log = await as(admin).json<Json>('GET', `${inboxApi.admin.audit}?contactId=${contact.id}`)
      expect((log.items as Json[]).map(entry => entry.action).sort()).toEqual(['erased', 'exported'])
    })
  })

  describe('tokens', () => {
    it('reads with the inbox scope, and needs the permission as a scope for anything else', async () => {
      const reader = await createToken(coord.cookie, ['inbox'])
      const listed = await bearer(reader).json<Json>('GET', inboxApi.admin.threads)
      expect(listed.total).toBeGreaterThan(0)
      const threadId = listed.items[0].id
      await expectApiError(bearer(reader).json('POST', inboxApi.admin.messages(threadId), { body: 'x' }), 403, 'insufficient_scope')
      await expectApiError(bearer(reader).json('PATCH', inboxApi.admin.thread(threadId), { assigneeId: coord.id }), 403, 'insufficient_scope')

      const noRead = await createToken(coord.cookie, ['inbox:reply'])
      await expectApiError(bearer(noRead).json('GET', inboxApi.admin.threads), 403, 'insufficient_scope')
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

  describe('pages', () => {
    it('renders the staff pages', async () => {
      for (const path of ['/admin/inbox', '/admin/inbox/settings']) {
        const response = await fetch(path, { headers: { cookie: admin.cookie } })
        expect(response.status, path).toBe(200)
      }
    })
  })
})
