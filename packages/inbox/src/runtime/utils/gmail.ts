import { base64UrlDecode, GMAIL_READONLY_SCOPE, GOOGLE_TOKEN_URL, signServiceAccountJwt } from './google'

// The Gmail API calls of the `gmail` inbound email driver (Google Workspace), with `fetch` only: an access token for a
// mailbox through a service account with domain-wide delegation, `users.watch` (push notifications to a Pub/Sub topic),
// and the catch-up from a stored history id: `users.history.list`, then `users.messages.get?format=raw` per new
// message. No database and no Nitro here, so the mapping is unit tested with a mocked `fetch`.

/** The service account and the Pub/Sub topic of the Gmail driver. */
export type GmailApiConfig = {
  /** The service account's `client_email`. */
  clientEmail: string
  /** The service account's `private_key` (PEM, PKCS #8). */
  privateKey: string
  /** The Pub/Sub topic Gmail publishes to, `projects/<project>/topics/<topic>`. */
  topic?: string
  /** Defaults to `https://gmail.googleapis.com`. */
  apiBase?: string
  /** Milliseconds one API call may take. Defaults to `10000`. */
  timeoutMs?: number
}

/** Where the driver left off in one mailbox, stored per email account (`inbox_email_cursors`). */
export type GmailCursor = {
  /** The history id the next catch-up starts from. */
  historyId?: string
  /** When the mailbox's watch runs out (epoch milliseconds). */
  watchExpiration?: number
}

const DEFAULT_API = 'https://gmail.googleapis.com'

class GmailApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** Access tokens by service account and user, until a minute before they expire (per Worker instance). */
const tokens = new Map<string, { token: string, expiresAt: number }>()

/** Forgets the cached access tokens (tests). */
export function clearGmailTokens(): void {
  tokens.clear()
}

/** An access token to read `user`'s mailbox (`gmail.readonly`), cached until a minute before it expires. */
export async function gmailAccessToken(config: GmailApiConfig, user: string, now = Date.now()): Promise<string> {
  const cacheKey = `${config.clientEmail}:${user.toLowerCase()}`
  const cached = tokens.get(cacheKey)
  if (cached && cached.expiresAt > now + 60_000) return cached.token
  const assertion = await signServiceAccountJwt({ clientEmail: config.clientEmail, privateKey: config.privateKey, subject: user, scope: GMAIL_READONLY_SCOPE, now })
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
  })
  const json = await response.json().catch(() => null) as { access_token?: string, expires_in?: number, error?: string, error_description?: string } | null
  if (!response.ok || !json?.access_token) {
    throw new GmailApiError(response.status, `Google refused a token for ${user} (${response.status}${json?.error ? ` ${json.error}` : ''}): check the service account's domain-wide delegation of ${GMAIL_READONLY_SCOPE}.`)
  }
  tokens.set(cacheKey, { token: json.access_token, expiresAt: now + (json.expires_in ?? 3600) * 1000 })
  return json.access_token
}

async function gmailFetch<T>(config: GmailApiConfig, token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${(config.apiBase || DEFAULT_API).replace(/\/+$/, '')}/gmail/v1/users/me${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
  })
  if (!response.ok) throw new GmailApiError(response.status, `The Gmail API answered ${response.status} for ${path.split('?')[0]}.`)
  return await response.json() as T
}

/** What a Pub/Sub push of a Gmail notification carries: the mailbox and its history id after the change. */
export type GmailPushNotification = { emailAddress: string, historyId: string }

/**
 * The Gmail notification of a Pub/Sub push request body (`{ message: { data: base64 JSON } }`), or `null` when it is
 * not one.
 */
export function parseGmailPush(body: unknown): GmailPushNotification | null {
  const data = (body as { message?: { data?: unknown } } | null)?.message?.data
  if (typeof data !== 'string') return null
  const bytes = base64UrlDecode(data)
  if (!bytes) return null
  try {
    const json = JSON.parse(new TextDecoder().decode(bytes)) as { emailAddress?: unknown, historyId?: unknown }
    const historyId = typeof json.historyId === 'number' ? String(json.historyId) : json.historyId
    if (typeof json.emailAddress !== 'string' || typeof historyId !== 'string' || !/^\d+$/.test(historyId)) return null
    return { emailAddress: json.emailAddress.toLowerCase(), historyId }
  }
  catch {
    return null
  }
}

/**
 * (Re)starts the watch of a mailbox: Gmail publishes a notification to `config.topic` whenever a message is added to
 * its inbox, for seven days. Answers the history id it starts from and when it runs out.
 */
export async function gmailWatch(config: GmailApiConfig, token: string): Promise<{ historyId: string, expiration: number }> {
  if (!config.topic) throw new Error('The Gmail driver needs inbox.email.inbound.gmail.topic (NUXT_INBOX_GMAIL_TOPIC).')
  const json = await gmailFetch<{ historyId?: string, expiration?: string }>(config, token, '/watch', {
    method: 'POST',
    body: JSON.stringify({ topicName: config.topic, labelIds: ['INBOX'], labelFilterBehavior: 'INCLUDE' }),
  })
  return { historyId: String(json.historyId ?? ''), expiration: Number(json.expiration ?? 0) }
}

/** The mailbox's current history id (`users.getProfile`). */
export async function gmailCurrentHistoryId(config: GmailApiConfig, token: string): Promise<string> {
  return String((await gmailFetch<{ historyId?: string }>(config, token, '/profile')).historyId ?? '')
}

type HistoryPage = {
  history?: Array<{ messagesAdded?: Array<{ message?: { id?: string, labelIds?: string[] } }> }>
  nextPageToken?: string
  historyId?: string
}

/** Labels of a message the inbox never takes in: the user's own drafts and sent mail, and spam. */
const SKIPPED_LABELS = ['DRAFT', 'SENT', 'SPAM']

/**
 * The ids of the messages added to the inbox since `startHistoryId`, oldest first, once each, and the history id to go
 * on from. `expired` when Gmail no longer has that history (a 404: about a week old), so the caller starts over.
 */
export async function gmailNewMessageIds(config: GmailApiConfig, token: string, startHistoryId: string, maxPages = 20): Promise<{ ids: string[], historyId: string } | { expired: true }> {
  const ids: string[] = []
  let historyId = startHistoryId
  let pageToken: string | undefined
  for (let page = 0; page < maxPages; page++) {
    const query = new URLSearchParams({ startHistoryId, historyTypes: 'messageAdded', labelId: 'INBOX', maxResults: '500' })
    if (pageToken) query.set('pageToken', pageToken)
    let json: HistoryPage
    try {
      json = await gmailFetch<HistoryPage>(config, token, `/history?${query}`)
    }
    catch (error) {
      if (error instanceof GmailApiError && error.status === 404) return { expired: true }
      throw error
    }
    for (const entry of json.history ?? []) {
      for (const added of entry.messagesAdded ?? []) {
        const message = added.message
        if (!message?.id || (message.labelIds ?? []).some(label => SKIPPED_LABELS.includes(label))) continue
        if (!ids.includes(message.id)) ids.push(message.id)
      }
    }
    if (json.historyId) historyId = String(json.historyId)
    pageToken = json.nextPageToken
    if (!pageToken) break
  }
  return { ids, historyId }
}

/** The raw RFC 5322 message (`users.messages.get?format=raw`), or `null` when it was deleted since. */
export async function gmailRawMessage(config: GmailApiConfig, token: string, id: string): Promise<Uint8Array | null> {
  try {
    const json = await gmailFetch<{ raw?: string }>(config, token, `/messages/${encodeURIComponent(id)}?format=raw`)
    return json.raw ? base64UrlDecode(json.raw) : null
  }
  catch (error) {
    if (error instanceof GmailApiError && error.status === 404) return null
    throw error
  }
}

/**
 * Takes in what was added to a mailbox's inbox since the cursor: every new message is handed to `deliver` as raw bytes,
 * oldest first, and the cursor moves on once all were delivered (a failure throws and keeps the cursor, so the next
 * push or run delivers them again: the inbox stores each Message-ID once). Without a history id yet, or when Gmail no
 * longer has it, it starts from `startAt` (the pushed history id) or the mailbox's current one: nothing older is taken
 * in.
 */
export async function gmailCatchUp(input: { config: GmailApiConfig, user: string, cursor: GmailCursor, startAt?: string, deliver: (raw: Uint8Array, gmailId: string) => Promise<void> }): Promise<GmailCursor & { delivered: number }> {
  const token = await gmailAccessToken(input.config, input.user)
  const start = async () => ({ ...input.cursor, historyId: input.startAt || await gmailCurrentHistoryId(input.config, token), delivered: 0 })
  if (!input.cursor.historyId) return start()
  const found = await gmailNewMessageIds(input.config, token, input.cursor.historyId)
  if ('expired' in found) {
    console.warn(`[inbox] Gmail no longer has the history of ${input.user} since ${input.cursor.historyId}: starting over from now`)
    return start()
  }
  let delivered = 0
  for (const id of found.ids) {
    const raw = await gmailRawMessage(input.config, token, id)
    if (!raw) continue
    await input.deliver(raw, id)
    delivered++
  }
  return { ...input.cursor, historyId: found.historyId, delivered }
}
