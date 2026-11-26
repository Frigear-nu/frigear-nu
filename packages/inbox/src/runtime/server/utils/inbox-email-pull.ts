import { verifyGoogleOidcToken } from '../../utils/google'
import type { GoogleJwk } from '../../utils/google'
import { gmailAccessToken, gmailCatchUp, gmailWatch } from '../../utils/gmail'
import type { GmailApiConfig, GmailCursor } from '../../utils/gmail'
import { createImapSession, imapConnection, imapPoll, parseImapSettings } from '../../utils/imap'
import type { ImapCursor, ImapSession } from '../../utils/imap'
import { GMAIL_AUTHSERV_IDS } from '../../utils/email-inbound'
import type { InboxRuntimeConfig } from '../../../types'
import type { InboxChannelAccountRow } from './inbox-dto'

// The inbound email drivers that fetch mail themselves: Gmail (push notifications plus a catch-up from the stored
// history id, and the watches the `inbox:gmail` task renews) and IMAP (the `inbox:imap` task's poll).

// --- Gmail ------------------------------------------------------------------------------------------------------------

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
/** Google's OIDC signing keys, until their `Cache-Control` max-age runs out (per instance, fetched on first use). */
let googleKeys: { keys: GoogleJwk[], expiresAt: number } | undefined

async function googleSigningKeys(force = false): Promise<GoogleJwk[]> {
  if (!force && googleKeys && googleKeys.expiresAt > Date.now()) return googleKeys.keys
  const response = await fetch(GOOGLE_CERTS_URL, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`Google's certificates answered ${response.status}`)
  const json = await response.json() as { keys?: GoogleJwk[] }
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1] ?? 3600)
  googleKeys = { keys: json.keys ?? [], expiresAt: Date.now() + Math.min(maxAge, 86_400) * 1000 }
  return googleKeys.keys
}

/**
 * Whether a Pub/Sub push carries a valid OIDC token for this server: Google-signed, for `gmail.audience`, and from
 * `gmail.pushServiceAccount` when it is set. Keys are refetched once when the token names one not cached yet.
 */
export async function inboxVerifyGooglePush(token: string | undefined, config: InboxRuntimeConfig['gmail']): Promise<boolean> {
  if (!token) return false
  const options = { audience: config.audience, email: config.pushServiceAccount || undefined }
  if (await verifyGoogleOidcToken(token, { ...options, keys: await googleSigningKeys() })) return true
  // A key Google rotated in since the cache was filled.
  return !!(await verifyGoogleOidcToken(token, { ...options, keys: await googleSigningKeys(true) }))
}

/** The Gmail API settings of the runtime config. */
function gmailApi(): GmailApiConfig {
  const config = inboxConfig().gmail
  if (!config.clientEmail || !config.privateKey) throw new Error('The Gmail driver needs inbox.gmail.clientEmail and inbox.gmail.privateKey.')
  return { clientEmail: config.clientEmail, privateKey: config.privateKey, topic: config.topic || undefined, apiBase: config.apiBase || undefined }
}

/**
 * Takes in what was added to the account's Gmail inbox since its stored history id (see `gmailCatchUp`), handing each
 * new message to `deliver`, and stores where it got to.
 */
export async function inboxGmailCatchUp(account: InboxChannelAccountRow, options: { startAt?: string, deliver: (raw: Uint8Array) => Promise<unknown> }) {
  const cursor = await inboxEmailCursor<GmailCursor>('gmail', account.id)
  const next = await gmailCatchUp({
    config: gmailApi(),
    user: account.address,
    cursor,
    startAt: options.startAt,
    deliver: async (raw) => {
      await options.deliver(raw)
    },
  })
  const { delivered, ...state } = next
  await inboxSaveEmailCursor('gmail', account.id, state)
  return { delivered }
}

/** A watch is renewed once it has less than this left (Google recommends renewing daily; it lasts seven days). */
const RENEW_BEFORE_MS = 2 * 24 * 60 * 60 * 1000

/**
 * The `inbox:gmail` task: for every Gmail account, renews its watch when it has less than two days left (or none),
 * then catches up on anything a push missed. One account's failure is logged and counted; the others still run.
 */
export async function inboxGmailRun(now = Date.now()): Promise<{ accounts: number, watched: number, delivered: number, failed: number }> {
  const accounts = await inboxEmailAccountsFor('gmail')
  const counts = { accounts: accounts.length, watched: 0, delivered: 0, failed: 0 }
  if (!accounts.length) return counts
  const api = gmailApi()
  for (const account of accounts) {
    try {
      const cursor = await inboxEmailCursor<GmailCursor>('gmail', account.id)
      if (!cursor.watchExpiration || cursor.watchExpiration - now < RENEW_BEFORE_MS) {
        const watch = await gmailWatch(api, await gmailAccessToken(api, account.address))
        await inboxSaveEmailCursor('gmail', account.id, { ...cursor, historyId: cursor.historyId || watch.historyId, watchExpiration: watch.expiration })
        counts.watched++
      }
      const { delivered } = await inboxGmailCatchUp(account, {
        deliver: raw => inboxDeliverRawEmail({ driver: 'gmail', raw, recipients: payload => inboxMailboxRecipients(payload, account.address), authservIds: GMAIL_AUTHSERV_IDS }),
      })
      counts.delivered += delivered
    }
    catch (error) {
      counts.failed++
      console.error(`[inbox] the Gmail mailbox of ${account.address} could not be watched or read`, error)
    }
  }
  return counts
}

// --- IMAP -------------------------------------------------------------------------------------------------------------

/**
 * Polls one IMAP account: its `config.imap` connection, its password from `secretRef` (`NUXT_INBOX_SECRETS_<REF>`),
 * the new messages since the stored UID (see `imapPoll`), stored with the account's address as the recipient.
 */
export async function inboxImapPollAccount(account: InboxChannelAccountRow, options: { limit?: number, session?: ImapSession } = {}) {
  const settings = parseImapSettings((account.config as Record<string, unknown> | null)?.imap)
  if (!settings) throw new Error('config.imap.host is missing')
  const password = inboxSecret(account.secretRef)
  if (!password) throw new Error(`the password secret (secretRef ${account.secretRef ?? 'unset'}) is not configured`)
  const session = options.session ?? await createImapSession(imapConnection(settings, account.address, password))
  const cursor = await inboxEmailCursor<ImapCursor>('imap', account.id)
  const result = await imapPoll({
    session,
    mailbox: settings.mailbox,
    cursor,
    limit: options.limit,
    deliver: async (raw) => {
      await inboxDeliverRawEmail({ driver: 'imap', raw, recipients: payload => inboxMailboxRecipients(payload, account.address), authservIds: settings.authservIds ?? [] })
    },
    save: state => inboxSaveEmailCursor('imap', account.id, state),
  })
  await inboxSaveEmailCursor('imap', account.id, { uidValidity: result.uidValidity, lastUid: result.lastUid })
  return { delivered: result.delivered, more: result.more }
}

/** The `inbox:imap` task: polls every IMAP account; one account's failure is logged and counted. */
export async function inboxImapRun(options: { limit?: number } = {}): Promise<{ accounts: number, delivered: number, failed: number, more: boolean }> {
  const accounts = await inboxEmailAccountsFor('imap')
  const counts = { accounts: accounts.length, delivered: 0, failed: 0, more: false }
  for (const account of accounts) {
    try {
      const result = await inboxImapPollAccount(account, options)
      counts.delivered += result.delivered
      counts.more ||= result.more
    }
    catch (error) {
      counts.failed++
      console.error(`[inbox] the IMAP mailbox of ${account.address} could not be read`, error)
    }
  }
  return counts
}
