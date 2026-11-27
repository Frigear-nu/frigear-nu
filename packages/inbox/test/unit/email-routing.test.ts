import { describe, expect, it } from 'vitest'
import {
  formatFromAddress,
  inboxPlusAddress,
  isOnInboxDomain,
  messageIdExternalIds,
  normaliseMessageId,
  parseInboxDomains,
  parseMessageIds,
  parsePlusAddress,
  replyMessageIds,
  routeEmailRecipient,
  threadCandidates,
  threadIdFromAddress,
} from '../../src/runtime/utils/email-routing'
import { emailReplyIds, emailToInbound, inboxEmailPayload } from '../../src/runtime/utils/payloads'

describe('inbox domains', () => {
  it('reads a comma separated list or an array, lower case, without blanks, repeats or junk', () => {
    expect(parseInboxDomains('Inbox.Example.org, volunteer.example.org,,inbox.example.org')).toEqual(['inbox.example.org', 'volunteer.example.org'])
    expect(parseInboxDomains(['@inbox.example.org', 'not a domain', 'localhost', 42])).toEqual(['inbox.example.org'])
    expect(parseInboxDomains('')).toEqual([])
    expect(parseInboxDomains(undefined)).toEqual([])
  })

  it('tells whether an address is on one', () => {
    const domains = ['inbox.example.org']
    expect(isOnInboxDomain('Support <SUPPORT@Inbox.Example.org>', domains)).toBe(true)
    expect(isOnInboxDomain('support@example.org', domains)).toBe(false)
    expect(isOnInboxDomain('support@sub.inbox.example.org', domains)).toBe(false)
    expect(isOnInboxDomain('support@inbox.example.org', [])).toBe(false)
    expect(isOnInboxDomain(null, domains)).toBe(false)
  })
})

describe('plus addresses', () => {
  it('splits an address into its base and tag', () => {
    expect(parsePlusAddress('Support+ibt_abc12345@Inbox.Example.org')).toEqual({ base: 'support@inbox.example.org', tag: 'ibt_abc12345' })
    expect(parsePlusAddress('support@inbox.example.org')).toEqual({ base: 'support@inbox.example.org', tag: null })
    expect(parsePlusAddress('support+@inbox.example.org')).toEqual({ base: 'support@inbox.example.org', tag: null })
    // A leading plus is part of the local part, not a tag.
    expect(parsePlusAddress('+ibt_abc12345@inbox.example.org')).toEqual({ base: '+ibt_abc12345@inbox.example.org', tag: null })
  })

  it('names a thread only with a tag of a thread id\'s shape', () => {
    expect(threadIdFromAddress('support+ibt_abc12345@inbox.example.org')).toBe('ibt_abc12345')
    expect(threadIdFromAddress('support+IBT_ABC12345@inbox.example.org')).toBe('ibt_abc12345')
    expect(threadIdFromAddress('support+ibt_short@inbox.example.org')).toBeNull()
    expect(threadIdFromAddress('support+newsletter@inbox.example.org')).toBeNull()
    expect(threadIdFromAddress('support+ibt_abc12345;drop@inbox.example.org')).toBeNull()
  })

  it('builds the reply address of a thread, also from a plus address', () => {
    expect(inboxPlusAddress('support@inbox.example.org', 'ibt_abc12345')).toBe('support+ibt_abc12345@inbox.example.org')
    expect(inboxPlusAddress('support+old@inbox.example.org', 'ibt_abc12345')).toBe('support+ibt_abc12345@inbox.example.org')
  })
})

describe('recipient routing', () => {
  const accounts = new Map([['support@inbox.example.org', { id: 'support' }], ['help+desk@inbox.example.org', { id: 'desk' }], ['team@example.com', { id: 'team' }]])
  const find = async (address: string) => accounts.get(address)
  const domains = ['inbox.example.org']
  const route = (address: string) => routeEmailRecipient(address, domains, find)

  it('takes an account with exactly the address first', async () => {
    expect(await route('Support@Inbox.example.org')).toEqual({ kind: 'account', account: { id: 'support' }, threadId: null })
    // An account whose own address has a plus wins over its base.
    expect(await route('help+desk@inbox.example.org')).toEqual({ kind: 'account', account: { id: 'desk' }, threadId: null })
  })

  it('routes a plus address to the account at its base, with the thread as a hint', async () => {
    expect(await route('support+ibt_abc12345@inbox.example.org')).toEqual({ kind: 'account', account: { id: 'support' }, threadId: 'ibt_abc12345' })
    expect(await route('support+anything@inbox.example.org')).toEqual({ kind: 'account', account: { id: 'support' }, threadId: null })
    expect(await route('team+ibt_abc12345@example.com')).toEqual({ kind: 'account', account: { id: 'team' }, threadId: 'ibt_abc12345' })
  })

  it('calls anything else on an inbox domain unknown, and the rest foreign', async () => {
    expect(await route('nobody@inbox.example.org')).toEqual({ kind: 'unknown' })
    expect(await route('nobody+ibt_abc12345@inbox.example.org')).toEqual({ kind: 'unknown' })
    expect(await route('someone@elsewhere.org')).toEqual({ kind: 'foreign' })
  })
})

describe('message ids and threading order', () => {
  it('normalises a Message-ID and refuses one that could break a header', () => {
    expect(normaliseMessageId(' <abc@mail.example> ')).toBe('abc@mail.example')
    expect(normaliseMessageId('abc@mail.example')).toBe('abc@mail.example')
    expect(normaliseMessageId('<a b@mail.example>')).toBeNull()
    expect(normaliseMessageId('<abc@mail.example>\r\nBcc: x@y')).toBeNull()
    expect(normaliseMessageId('')).toBeNull()
  })

  it('reads the ids of In-Reply-To and References', () => {
    expect(parseMessageIds('<a@x> <b@y>\r\n <c@z>')).toEqual(['a@x', 'b@y', 'c@z'])
    expect(parseMessageIds(['<a@x>', 'b@y'])).toEqual(['a@x', 'b@y'])
    expect(parseMessageIds(null)).toEqual([])
  })

  it('tries In-Reply-To first, then References from the newest back, once each', () => {
    expect(replyMessageIds('<c@z>', '<a@x> <b@y> <c@z>')).toEqual(['c@z', 'b@y', 'a@x'])
    expect(replyMessageIds(null, '<a@x> <b@y>')).toEqual(['b@y', 'a@x'])
    expect(replyMessageIds(null, Array.from({ length: 40 }, (_, index) => `<m${index}@x>`).join(' '))).toHaveLength(20)
  })

  it('matches a stored provider id with or without angle brackets', () => {
    expect(messageIdExternalIds('email', 'a@x')).toEqual(['email:<a@x>', 'email:a@x'])
  })

  it('orders the threads to try: reply address, referenced message, subject marker', () => {
    expect(threadCandidates({ threadHint: 'ibt_hint00001', referencedThreads: ['ibt_refs00001', 'ibt_refs00002'], subjectThreadId: 'ibt_subj00001' }))
      .toEqual(['ibt_hint00001', 'ibt_refs00001', 'ibt_refs00002', 'ibt_subj00001'])
    expect(threadCandidates({ referencedThreads: [null, 'ibt_refs00001'], subjectThreadId: 'ibt_refs00001' })).toEqual(['ibt_refs00001'])
    expect(threadCandidates({ threadHint: 'not-a-thread', subjectThreadId: null })).toEqual([])
  })

  it('maps In-Reply-To and References of a webhook payload, also from its headers', () => {
    const base = { messageId: '<n@mail.example>', from: 'kari@example.org', to: 'support@inbox.example.org', text: 'Hi' }
    const fields = inboxEmailPayload.parse({ ...base, inReplyTo: '<b@x>', references: ['<a@x>', '<b@x>'] })
    expect(emailReplyIds(fields)).toEqual(['b@x', 'a@x'])
    const headers = inboxEmailPayload.parse({ ...base, headers: { 'In-Reply-To': '<b@x>', 'references': '<a@x> <b@x>' } })
    expect(emailReplyIds(headers)).toEqual(['b@x', 'a@x'])
    const inbound = emailToInbound(fields, 'support@inbox.example.org', 'ibt_hint00001')
    expect(inbound).toMatchObject({ threadHint: 'ibt_hint00001', references: ['b@x', 'a@x'] })
  })
})

describe('From', () => {
  it('quotes the display name and keeps it to one safe line', () => {
    expect(formatFromAddress('Support', 'support@inbox.example.org')).toBe('"Support" <support@inbox.example.org>')
    expect(formatFromAddress('Evil "name"\r\nBcc: x@y <z>', 'a@x.org')).toBe('"Evil name Bcc: x@y z" <a@x.org>')
    expect(formatFromAddress('', 'a@x.org')).toBe('a@x.org')
  })
})
