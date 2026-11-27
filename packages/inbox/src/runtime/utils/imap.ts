// The poll of the `imap` inbound email driver: connect (imapflow), open the mailbox read-only, take in every message
// with a UID above the last one seen (`UID SEARCH` + `UID FETCH BODY.PEEK[]`, so nothing is marked read), and remember
// where it left off. imapflow runs on Node and on Cloudflare Workers; on Workers it connects over `cloudflare:sockets`
// (`createSocketsTransport`), which also does STARTTLS. No database and no Nitro here: the session is injectable, so
// the cursor logic is unit tested with a fake one, and the real client against a scripted server.

/** An IMAP account's connection: `config.imap` of an email channel account; the password comes from its `secretRef`. */
export type ImapAccountSettings = {
  host: string
  /** Defaults to `993` with `secure`, `143` without. */
  port?: number
  /** Implicit TLS (`true`, the default) or a cleartext connection upgraded with STARTTLS when the server offers it. */
  secure?: boolean
  /** The login. Defaults to the account's address. */
  user?: string
  /** The folder to read. Defaults to `INBOX`. */
  mailbox?: string
  /**
   * The authserv-ids of the server's `Authentication-Results` to trust (`mx.google.com` for Gmail). None by default:
   * every message is then unauthenticated (it starts a new thread).
   */
  authservIds?: string[]
}

/** Where the poll left off in one mailbox, stored per email account (`inbox_email_cursors`). */
export type ImapCursor = {
  /** The mailbox's UIDVALIDITY the UIDs belong to: when it changes, the UIDs mean other messages. */
  uidValidity?: string
  /** The highest UID taken in. */
  lastUid?: number
}

/** The part of an imapflow client the poll uses. */
export type ImapSession = {
  connect: () => Promise<void>
  mailboxOpen: (path: string, options: { readOnly: boolean }) => Promise<{ uidValidity: bigint | number | string, uidNext: number }>
  search: (query: { uid: string }, options: { uid: true }) => Promise<number[] | false | undefined>
  fetchOne: (uid: string, query: { source: true }, options: { uid: true }) => Promise<{ source?: Uint8Array } | false>
  logout: () => Promise<void>
  close?: () => void
}

/** Connection settings with the password, as `createImapSession` takes them. */
export type ImapConnection = { host: string, port: number, secure: boolean, user: string, password: string }

/** Whether this runs on Cloudflare Workers. */
function onWorkers(): boolean {
  return (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent === 'Cloudflare-Workers'
}

/**
 * An imapflow client for the connection. On Workers it connects through `cloudflare:sockets` (imported at run time:
 * the specifier is never bundled), elsewhere through `node:net`/`node:tls`. Nothing is logged.
 */
export async function createImapSession(connection: ImapConnection): Promise<ImapSession> {
  const { ImapFlow, createSocketsTransport } = await import('imapflow')
  let transport: ReturnType<typeof createSocketsTransport> | undefined
  if (onWorkers()) {
    const specifier = 'cloudflare:sockets'
    const sockets = await import(/* @vite-ignore */ specifier) as { connect: Parameters<typeof createSocketsTransport>[0] }
    transport = createSocketsTransport(sockets.connect)
  }
  return new ImapFlow({
    host: connection.host,
    port: connection.port,
    secure: connection.secure,
    auth: { user: connection.user, pass: connection.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 15_000,
    ...(transport ? { transport } : {}),
  }) as unknown as ImapSession
}

/** The connection of an account's settings, its address (the default login) and its password. */
export function imapConnection(settings: ImapAccountSettings, address: string, password: string): ImapConnection {
  const secure = settings.secure !== false
  return { host: settings.host, port: settings.port ?? (secure ? 993 : 143), secure, user: settings.user || address, password }
}

/** Valid `config.imap` of an email account, or `null` (no host). */
export function parseImapSettings(value: unknown): ImapAccountSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const host = typeof raw.host === 'string' ? raw.host.trim() : ''
  if (!host || /[\s/]/.test(host)) return null
  const port = typeof raw.port === 'number' && Number.isInteger(raw.port) && raw.port > 0 && raw.port < 65536 ? raw.port : undefined
  return {
    host,
    ...(port ? { port } : {}),
    ...(typeof raw.secure === 'boolean' ? { secure: raw.secure } : {}),
    ...(typeof raw.user === 'string' && raw.user.trim() ? { user: raw.user.trim() } : {}),
    ...(typeof raw.mailbox === 'string' && raw.mailbox.trim() ? { mailbox: raw.mailbox.trim() } : {}),
    ...(Array.isArray(raw.authservIds) ? { authservIds: raw.authservIds.filter((id): id is string => typeof id === 'string').map(id => id.trim().toLowerCase()).filter(Boolean) } : {}),
  }
}

/**
 * Takes in the new messages of a mailbox: the ones with a UID above `cursor.lastUid`, oldest first, at most `limit`,
 * each handed to `deliver` as raw bytes. The cursor moves on after each delivered message, so a failure keeps what went
 * in and the next poll starts with the one that failed. The first poll of a mailbox (or one whose UIDVALIDITY changed)
 * takes nothing in and starts after the newest message: older mail is not imported. `more` says the limit cut it short.
 * The session is logged out at the end, also on a failure.
 */
export async function imapPoll(input: {
  session: ImapSession
  mailbox?: string
  cursor: ImapCursor
  deliver: (raw: Uint8Array, uid: number) => Promise<void>
  /** Called with the cursor after every delivered message, to store it. */
  save?: (cursor: ImapCursor) => Promise<void>
  limit?: number
}): Promise<ImapCursor & { delivered: number, more: boolean }> {
  const { session } = input
  const limit = input.limit ?? 50
  await session.connect()
  try {
    const opened = await session.mailboxOpen(input.mailbox || 'INBOX', { readOnly: true })
    const uidValidity = String(opened.uidValidity)
    if (input.cursor.uidValidity !== uidValidity || typeof input.cursor.lastUid !== 'number') {
      return { uidValidity, lastUid: Math.max(0, opened.uidNext - 1), delivered: 0, more: false }
    }
    const lastUid = input.cursor.lastUid
    // `n:*` always matches the newest message, even when its UID is below `n`: only higher UIDs are new.
    const found = await session.search({ uid: `${lastUid + 1}:*` }, { uid: true })
    const uids = [...new Set(found || [])].filter(uid => uid > lastUid).sort((a, b) => a - b)
    const cursor: ImapCursor = { uidValidity, lastUid }
    let delivered = 0
    for (const uid of uids.slice(0, limit)) {
      const message = await session.fetchOne(String(uid), { source: true }, { uid: true })
      if (message && message.source) {
        await input.deliver(new Uint8Array(message.source), uid)
        delivered++
      }
      cursor.lastUid = uid
      await input.save?.({ ...cursor })
    }
    return { ...cursor, delivered, more: uids.length > limit }
  }
  finally {
    await session.logout().catch(() => session.close?.())
  }
}
