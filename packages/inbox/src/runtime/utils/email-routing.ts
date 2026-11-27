// Two-way email: inbox domains, reply addresses (`support+ibt_...@inbox.example.org`) and the Message-IDs a reply
// answers. Pure functions, so they are unit tested without a server.

/** `Kari <kari@example.com>` -> `kari@example.com`, lower case (as `normaliseEmail` of the payloads). */
function normaliseEmail(value: string): string {
  const angled = /<([^<>]+)>/.exec(value)
  return (angled ? angled[1]! : value).trim().toLowerCase()
}

/** The shape of a thread id, as a reply address or a subject marker carries it. */
export const INBOX_THREAD_ID = /^ibt_[a-z0-9]{8,64}$/

/**
 * The inbox domains of `inbox.email.domains` (`NUXT_INBOX_DOMAINS`): a comma separated list or an array, lower case,
 * without blanks or repeats. Anything else is no domain.
 */
export function parseInboxDomains(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const domains = list
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim().toLowerCase().replace(/^@/, ''))
    .filter(item => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(item))
  return [...new Set(domains)]
}

/** The domain of an email address, lower case (`''` when it has none). */
export function emailDomainOf(address: string): string {
  const email = normaliseEmail(address)
  const at = email.lastIndexOf('@')
  return at < 0 ? '' : email.slice(at + 1)
}

/** Whether the address is on one of the inbox domains. */
export function isOnInboxDomain(address: string | null | undefined, domains: readonly string[]): boolean {
  if (!address || !domains.length) return false
  return domains.includes(emailDomainOf(address))
}

/**
 * A plus address split up: `support+ibt_abc12345@inbox.example.org` is the base `support@inbox.example.org` with the
 * tag `ibt_abc12345`. An address without a tag answers itself and `null`.
 */
export function parsePlusAddress(address: string): { base: string, tag: string | null } {
  const email = normaliseEmail(address)
  const at = email.lastIndexOf('@')
  if (at < 0) return { base: email, tag: null }
  const local = email.slice(0, at)
  const plus = local.indexOf('+')
  if (plus <= 0) return { base: email, tag: null }
  return { base: `${local.slice(0, plus)}${email.slice(at)}`, tag: local.slice(plus + 1) || null }
}

/** The thread id a plus address names, when its tag has the shape of one. */
export function threadIdFromAddress(address: string): string | null {
  const { tag } = parsePlusAddress(address)
  return tag && INBOX_THREAD_ID.test(tag) ? tag : null
}

/** The reply address of a thread: `local+<threadId>@domain` for the address `local@domain`. */
export function inboxPlusAddress(address: string, threadId: string): string {
  const { base } = parsePlusAddress(address)
  const at = base.lastIndexOf('@')
  return `${base.slice(0, at)}+${threadId}${base.slice(at)}`
}

/** Where a recipient address leads. */
export type InboxRecipientRoute<A>
  = | { kind: 'account', account: A, threadId: string | null }
    /** On an inbox domain, but no account has it: the sender should get a bounce. */
    | { kind: 'unknown' }
    /** Not ours: no account, and not on an inbox domain. */
    | { kind: 'foreign' }

/**
 * Routes one recipient: an account with exactly this address first; then, for a plus address `local+tag@domain`, the
 * account at `local@domain`, with the tag as a thread hint when it has the shape of a thread id; anything else on an
 * inbox domain is unknown. `find` looks an address up (an enabled or disabled email account).
 */
export async function routeEmailRecipient<A>(address: string, domains: readonly string[], find: (address: string) => Promise<A | undefined>): Promise<InboxRecipientRoute<A>> {
  const email = normaliseEmail(address)
  const exact = await find(email)
  if (exact) return { kind: 'account', account: exact, threadId: null }
  const { base, tag } = parsePlusAddress(email)
  if (tag) {
    const account = await find(base)
    if (account) return { kind: 'account', account, threadId: INBOX_THREAD_ID.test(tag) ? tag : null }
  }
  return isOnInboxDomain(email, domains) ? { kind: 'unknown' } : { kind: 'foreign' }
}

/**
 * A Message-ID without its angle brackets and blanks, or `null` when it is not one header-safe id (no spaces, no line
 * breaks, at most 998 characters).
 */
export function normaliseMessageId(value: string | null | undefined): string | null {
  const id = (value ?? '').trim().replace(/^<+/, '').replace(/>+$/, '').trim()
  if (!id || id.length > 996 || /[\s<>]/.test(id)) return null
  return id
}

/** The Message-IDs in an `In-Reply-To` or `References` value (`<a@x> <b@y>`), in order. */
export function parseMessageIds(value: string | readonly string[] | null | undefined): string[] {
  const values = typeof value === 'string' ? [value] : [...(value ?? [])]
  const ids: string[] = []
  for (const item of values) {
    if (typeof item !== 'string') continue
    const angled = item.match(/<[^<>\s]+>/g)
    const parts = angled ?? item.split(/[\s,]+/)
    for (const part of parts) {
      const id = normaliseMessageId(part)
      if (id) ids.push(id)
    }
  }
  return ids
}

/** Most Message-IDs of a reply looked up: the newest ones of a long `References` chain. */
export const INBOX_MAX_REFERENCES = 20

/**
 * The Message-IDs an email answers, the most telling first: `In-Reply-To`, then `References` from the newest (its
 * end) back, once each, at most `INBOX_MAX_REFERENCES`.
 */
export function replyMessageIds(inReplyTo: string | readonly string[] | null | undefined, references: string | readonly string[] | null | undefined): string[] {
  const ordered = [...parseMessageIds(inReplyTo), ...parseMessageIds(references).reverse()]
  return [...new Set(ordered)].slice(0, INBOX_MAX_REFERENCES)
}

/**
 * The stored `externalId`s a Message-ID may have on a channel: `email:<id>` and `email:id`, as providers send it with
 * or without angle brackets.
 */
export function messageIdExternalIds(channel: string, id: string): string[] {
  return [`${channel}:<${id}>`, `${channel}:${id}`]
}

/** The `externalId` of a reply the inbox sent by email with its own Message-ID (whatever the thread's channel). */
export function outboundEmailExternalId(id: string): string {
  return `email:out:${id}`
}

/**
 * Every stored `externalId` a Message-ID an email answers may have, in the order they are looked up: an inbound message
 * of the channel (`messageIdExternalIds`), then, on email, a reply the inbox sent with that Message-ID
 * (`email:out:<id>`).
 */
export function referenceExternalIds(channel: string, id: string): string[] {
  return [...messageIdExternalIds(channel, id), ...(channel === 'email' ? [outboundEmailExternalId(id)] : [])]
}

/**
 * The thread ids a reply may join, in the order they are tried: the reply address (`threadHint`), then the threads of
 * the stored messages it answers (`referencedThreads`, in the order of `replyMessageIds`), then the subject marker.
 * Each is still checked (same mailbox, same contact, not anonymised) before the message joins it.
 */
export function threadCandidates(input: { threadHint?: string | null, referencedThreads?: ReadonlyArray<string | null | undefined>, subjectThreadId?: string | null }): string[] {
  const ordered = [input.threadHint, ...(input.referencedThreads ?? []), input.subjectThreadId]
  return [...new Set(ordered.filter((id): id is string => !!id && INBOX_THREAD_ID.test(id)))]
}

/** A display name safe for a `From` header: one line, no quotes or angle brackets, at most 64 characters. */
export function safeDisplayName(name: string | null | undefined): string {
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  return (name ?? '').replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029"<>\\]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 64).trim()
}

/** `"Name" <address>`, or the bare address without a name. */
export function formatFromAddress(name: string | null | undefined, address: string): string {
  const display = safeDisplayName(name)
  return display ? `"${display}" <${address}>` : address
}

/** The Notify email drivers inbox replies can go out through instead of Notify's own (`inbox.email.outbound`). */
export const INBOX_OUTBOUND_EMAIL_DRIVERS = ['log', 'resend', 'ses', 'cloudflare', 'cloudflare-binding'] as const
