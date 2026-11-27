import type { EventHandler, H3Event } from 'h3'
import type { Grant } from '@frigear-nu/auth/grants'
import type { OwnerRef } from '@frigear-nu/teams'

export type { Grant, OwnerRef }

/** A text in one language, or one per locale code (`{ da: '...', en: '...' }`), as in `@frigear-nu/ui`. */
export type Translated = string | Record<string, string>

/** The built-in channels. Other modules add their own with `extendInbox`. */
export type InboxBuiltInChannel = 'form' | 'email' | 'whatsapp' | 'messenger' | 'instagram'
/** A channel id: a built-in one or one a module registered. */
export type InboxChannelId = InboxBuiltInChannel | (string & {})

/** `platform` and `team` mailboxes exist now; `user` mailboxes come with the user side of the inbox. */
export type InboxMailboxOwnerType = 'platform' | 'team' | 'user'
export type InboxThreadStatus = 'open' | 'pending' | 'closed'
/** `in`: from the contact. `out`: a reply that went out through the channel. `note`: internal, never sent. */
export type InboxMessageDirection = 'in' | 'out' | 'note'

/** A file on a message: a NuxtHub Blob pathname (form uploads) or a provider URL, never the bytes themselves. */
export type InboxAttachment = {
  filename: string
  contentType?: string
  size?: number
  /** NuxtHub Blob pathname, for files a form stored. */
  pathname?: string
  /** A link at the provider, for files an email or Meta webhook announced. */
  url?: string
}

// --- Channels ----------------------------------------------------------------------------------------------------------

/** One inbound message, normalised by a channel: what `inboxReceive` stores. */
export type InboxInboundMessage = {
  /** The channel account it arrived on: its id, or its `address` on the channel (an email address, a page id). */
  accountId?: string
  address?: string
  /** The sender, identified on the channel by `externalId` (an email address, a WhatsApp id, a page-scoped id). */
  contact: { externalId: string, name?: string | null, email?: string | null, phone?: string | null, userId?: number | null }
  /** The provider's id of the message: the same id twice is stored once (webhook retries). */
  externalId: string
  subject?: string | null
  body: string
  attachments?: InboxAttachment[]
  /** Email `Cc` recipients (lower case), stored on the message and shown with `inbox:pii`. */
  cc?: string[]
  /** A thread id the message answers (`[ibt_...]` in an email subject); used when it belongs to the same mailbox and contact. */
  threadId?: string | null
  /**
   * A thread id the address named (`support+ibt_...@inbox.example.org`, the `Reply-To` of a reply). Tried before
   * `references` and `threadId`, with the same checks.
   */
  threadHint?: string | null
  /**
   * The provider ids of the messages this one answers, most telling first (an email's `In-Reply-To`, then its
   * `References` newest first). A stored message of the same account with one of them (`<channel>:<id>`) names the
   * thread, tried after `threadHint` and before `threadId`.
   */
  references?: string[]
  /**
   * Whether the channel verified the sender: a signed-in user, Meta's signed webhook, an email that passed SPF, DKIM or
   * DMARC. Only an authenticated message joins an existing thread or renames its contact; anything else (the default)
   * starts a new thread.
   */
  authenticated?: boolean
}

/** What a channel's `send` gets to deliver a reply. */
export type InboxSendContext = {
  event: H3Event
  mailbox: InboxMailboxDto
  /** The channel account the thread came in on, `null` when it was deleted since. */
  account: InboxChannelAccountDto | null
  /** The account's secret (an access token), resolved from `secretRef`; never stored in the database. */
  secret: string | undefined
  thread: InboxThreadDto
  /** The contact with their details, as the channel needs them to reach the person. */
  contact: InboxContactDetails
  message: { id: string, body: string, attachments: InboxAttachment[] }
}

/** What a channel's `inbound` gets besides the request. */
export type InboxInboundContext = {
  /** The value of the adapter's `inboundSecret`, never empty: verify the request with it. */
  secret: string
  /**
   * The request body as text, read by the inbox with its webhook size limit (1 MB; a larger body is a 413 before the
   * adapter runs). Verify a signature over it and parse it.
   */
  rawBody: string
}

/** What a channel's `send` may return: the provider's id of the sent message. */
export type InboxSendResult = {
  externalId?: string | null
  /** The email addresses the channel copied (`Cc`), stored on the reply. Invalid addresses are dropped. */
  cc?: string[] | null
  /**
   * The `Message-ID` a reply sent by email went out with, when the sender reported it (Notify's `cloudflare-binding`
   * driver does). Stored as `email:out:<id>` (it wins over `externalId`), so an answer to it threads by its headers.
   */
  messageId?: string | null
} | undefined

/** A channel adapter, the default export of the file `extendInbox` names. */
export type InboxChannelAdapter = {
  id: string
  label?: Translated
  /**
   * Reads a webhook on `POST /api/inbox/webhooks/:channel` and returns the messages in it. Verify the request here with
   * `ctx.secret` (throw a 401 when the signature or token does not match). The inbox only calls it once
   * `inboundSecret` names a configured secret: otherwise the webhook answers 501 `not_configured`, so a channel is never
   * open by default. Built-in channels have routes of their own instead.
   */
  inbound?: (event: H3Event, ctx: InboxInboundContext) => InboxInboundMessage[] | Promise<InboxInboundMessage[]>
  /**
   * The name of the `inbox.secrets` entry `inbound` verifies requests with (a signing secret or a shared token, e.g.
   * `ACME_SMS_WEBHOOK`, set by `NUXT_INBOX_SECRETS_ACME_SMS_WEBHOOK`). Required with `inbound`.
   */
  inboundSecret?: string
  /** Delivers a reply. Throw to fail the reply: nothing is stored then. */
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- an adapter may return nothing
  send: (ctx: InboxSendContext) => InboxSendResult | void | Promise<InboxSendResult | void>
}

/** A channel registration of `extendInbox`: the label for the app, and the server file with the adapter. */
export type InboxChannelDefinition = {
  id: string
  label: Translated
  icon?: string
  /** Absolute path of a server file default-exporting `defineInboxChannel({ ... })`. */
  adapter: string
}

/** What a channel looks like to the app (`#inbox/registry`). */
export type InboxChannelInfo = { id: string, label: Translated, icon?: string }

export type InboxExtension = { channels?: InboxChannelDefinition[], emailDrivers?: InboxEmailDriverDefinition[] }

// --- Inbound email drivers ---------------------------------------------------------------------------------------------

/**
 * An inbound email driver, the default export of the file an `emailDrivers` registration names
 * (`defineInboxEmailDriver`). It receives email from one provider and hands it to `inboxIngestEmail`, which routes it
 * to the mailboxes and stores it. A driver has a `handler`, mounted at `POST /api/inbox/email/<name>` (a provider's
 * webhook), a `setup` run once in a Nitro plugin (a runtime hook such as `cloudflare:email`), or both.
 */
/**
 * The parts of the Nitro app a driver's `setup` gets. Typed here rather than as nitropack's `NitroApp`, so the published
 * types do not pull in nitropack (and through it vite and esbuild). Cast `hooks` to the hook a driver registers.
 */
export type InboxNitroApp = {
  hooks: object
  localFetch: (url: string, init?: RequestInit) => Promise<Response>
}

export type InboxEmailDriver = {
  name: string
  /** Answers `POST /api/inbox/email/<name>`. Verify the request (a signature) before anything else. */
  handler?: EventHandler
  /** Runs once when the server starts, with the Nitro app: register runtime hooks here. */
  setup?: (nitroApp: InboxNitroApp) => void
}

/** An inbound email driver registration: its name and the server file default-exporting `defineInboxEmailDriver()`. */
export type InboxEmailDriverDefinition = {
  /** Lower case words joined by `.`, `_` or `-`; the last part of its URL. */
  name: string
  /** Absolute path of the server file. */
  driver: string
}

/** The settings of an `email` channel account (`config`), none of them secret. */
export type InboxEmailAccountConfig = {
  /** Where answers to replies go when the address is not on an inbox domain. Defaults to the address. */
  replyTo?: string
  /**
   * Send replies from this address (`"<Mailbox name>" <address>`) instead of Notify's `from`. The domain must be
   * verified with the email provider Notify sends through. Defaults to `false`.
   */
  sendFromAddress?: boolean
  /**
   * A driver that fetches this address's mail itself: `gmail` (a Google Workspace mailbox, as this address) or `imap`
   * (with `imap`). Unset for mail that is pushed to the inbox (Cloudflare, Resend, the JSON webhook).
   */
  inbound?: 'gmail' | 'imap'
  /** The IMAP connection of `inbound: 'imap'`; the password is the account's `secretRef`. */
  imap?: { host: string, port?: number, secure?: boolean, user?: string, mailbox?: string, authservIds?: string[] }
}

/** A Notify email driver inbox replies can go out through (`inbox.email.outbound`). */
export type InboxOutboundEmailDriver = 'log' | 'resend' | 'ses' | 'cloudflare' | 'cloudflare-binding'

// --- DTOs --------------------------------------------------------------------------------------------------------------

export type InboxMailboxDto = {
  id: string
  key: string
  ownerType: InboxMailboxOwnerType
  ownerId: string | null
  name: Translated
  /** Who reads it besides staff (and a team mailbox's leads): any one grant admits, never `public`. */
  grants: Grant[]
  /** Days a closed thread is kept; `null` takes `inbox.retention.days`. */
  retentionDays: number | null
  createdAt: string
  updatedAt: string
}

export type InboxChannelAccountDto = {
  id: string
  mailboxId: string
  channel: InboxChannelId
  /** The identity on the channel: an email address, a WhatsApp phone number id, a page id, a form slug. */
  address: string
  /** Settings that are not secret (`fields` of a form account, `replyTo` of an email account). */
  config: Record<string, unknown>
  /** The name of the secret in `inbox.secrets` (`NUXT_INBOX_SECRETS_<REF>`); the value is never stored or shown. */
  secretRef: string | null
  /** Whether `secretRef` resolves to a value on this server. */
  secretConfigured: boolean
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/** How email reaches the inbox on this server (`GET /api/admin/inbox/email`). */
export type InboxEmailSettingsDto = {
  /** The inbox domains (`NUXT_INBOX_DOMAINS`). */
  domains: string[]
  /** The inbound email drivers installed besides the signed JSON webhook (`cloudflare`, `resend`, a host's own). */
  drivers: string[]
}

/** A contact as everyone with access to the thread sees them: no contact details. */
export type InboxContactDto = {
  id: string
  channel: InboxChannelId
  name: string | null
  /** Contact details, only with `inbox:pii`. */
  email?: string | null
  phone?: string | null
  externalId?: string | null
  userId?: number | null
  erasedAt: string | null
}

/** A contact with every detail, for channels and exports. */
export type InboxContactDetails = {
  id: string
  channel: InboxChannelId
  externalId: string
  name: string | null
  email: string | null
  phone: string | null
  userId: number | null
}

export type InboxUserRef = { id: number, name: string | null }

export type InboxThreadDto = {
  id: string
  mailboxId: string
  contactId: string
  channelAccountId: string | null
  channel: InboxChannelId
  subject: string | null
  status: InboxThreadStatus
  assigneeId: number | null
  /** `null`: everyone with access to the mailbox; otherwise only people at or above this global role. */
  hiddenBelow: string | null
  lastMessageAt: string
  anonymisedAt: string | null
  createdAt: string
  updatedAt: string
}

/** A row of the staff thread list. */
export type InboxThreadListItemDto = InboxThreadDto & {
  contact: InboxContactDto | null
  assignee: InboxUserRef | null
  /** The start of the last message that is not a note. */
  preview: string | null
}

export type InboxMessageDto = {
  id: string
  threadId: string
  direction: InboxMessageDirection
  authorId: number | null
  author: InboxUserRef | null
  body: string
  attachments: InboxAttachment[]
  /** Email `Cc` recipients of an inbound message, or the people a reply copied; only with `inbox:pii`. */
  cc?: string[] | null
  /**
   * The contact who sent an inbound message (`null` for replies and notes): usually the thread's contact, another one
   * for a reply by email in a contact form thread.
   */
  contactId: string | null
  createdAt: string
}

/** What the caller may do with a thread, for the thread page. */
export type InboxThreadAbilities = { reply: boolean, assign: boolean, hide: boolean, pii: boolean, audit: boolean, erase: boolean }

export type InboxThreadDetailDto = {
  thread: InboxThreadDto
  mailbox: InboxMailboxDto
  contact: InboxContactDto | null
  assignee: InboxUserRef | null
  messages: InboxMessageDto[]
  can: InboxThreadAbilities
  /** The global roles the caller can hide a thread below (the roles they hold). */
  hideRoles: string[]
}

export type InboxAuditAction = 'viewed' | 'replied' | 'noted' | 'assigned' | 'status' | 'hidden' | 'exported' | 'erased' | 'retention' | 'linked'

export type InboxAuditDto = {
  id: string
  threadId: string | null
  contactId: string | null
  actorId: number | null
  actor: InboxUserRef | null
  action: InboxAuditAction
  data: Record<string, unknown> | null
  createdAt: string
}

export type InboxSummaryDto = {
  /** Open or pending threads nobody is assigned to, in the mailboxes the caller reads. */
  unassigned: number
  /** Open or pending threads assigned to the caller. */
  mine: number
  /** Mailboxes the caller reads. */
  mailboxes: number
}

export type InboxContactExportDto = {
  contact: InboxContactDetails & { createdAt: string, erasedAt: string | null }
  /** The other contacts of the same person: every contact with the same email address (one per channel). */
  related: Array<InboxContactDetails & { createdAt: string, erasedAt: string | null }>
  /**
   * Their threads with every message but internal notes, and the threads of other contacts they wrote in with only the
   * messages they sent there.
   */
  threads: Array<{ thread: InboxThreadDto, messages: Array<Omit<InboxMessageDto, 'author'>> }>
  exportedAt: string
}

export type InboxRetentionResult = {
  mailboxes: number
  threads: number
  contacts: number
  mode: InboxRetentionMode
  /** Whether a mailbox had more expired threads than this run's budget let it handle: the next run goes on. */
  more: boolean
}

// --- Hooks -------------------------------------------------------------------------------------------------------------

export type InboxMessageContext = { event: H3Event, thread: InboxThreadDto, message: InboxMessageDto }
export type InboxThreadAssignedContext = { event: H3Event, thread: InboxThreadDto, assigneeId: number | null, previous: number | null }
export type InboxThreadStatusContext = { event: H3Event, thread: InboxThreadDto, from: InboxThreadStatus, to: InboxThreadStatus }
/**
 * `inbox:thread:linked`: `module` did `kind` for the thread's person (`userId`) from the thread `threadId`; `label` and
 * `url` describe it on the audit trail ("Added to the crew of Summer 2027"). `actorId` is who did it.
 */
export type InboxThreadLinkedContext = { event: H3Event, threadId: string, actorId: number | null, module: string, kind: string, label?: string, url?: string, userId?: number | null }

/**
 * What an `inbox.thread.actions` widget receives (as props) on the staff thread page: the thread, its contact (details
 * only with `inbox:pii`; `userId` is the account of a verified contact) and `onChanged`, to refresh the page.
 */
export type InboxThreadActionContext = { threadId: string, contact: InboxContactDto | null, onChanged: () => unknown }

// --- Options -----------------------------------------------------------------------------------------------------------

export type InboxRetentionMode = 'delete' | 'anonymise'

export type InboxMailboxSeed = {
  key: string
  name: Translated
  ownerType?: 'platform' | 'team'
  ownerId?: string | null
  /** Who reads it besides staff. A platform mailbox names someone; `public` is refused. */
  grants?: Grant[]
  retentionDays?: number | null
}

export type ModuleOptions = {
  /** Channels of the host, next to the built-in ones and those of other modules (`extendInbox`). */
  channels?: InboxChannelDefinition[]
  /** Mailboxes created on the first request when their key does not exist yet; never changed afterwards. */
  mailboxes?: InboxMailboxSeed[]
  retention?: {
    /** Days a closed thread is kept when its mailbox sets none. Defaults to `365`; `false` keeps them. */
    days?: number | false
    /** `delete` (default) removes the thread and its messages; `anonymise` keeps the thread and blanks every message. */
    mode?: InboxRetentionMode
    /** Cron of the `inbox:retention` task. Defaults to `'30 3 * * *'`; `false` registers the task without a schedule. */
    cron?: string | false
    /** Threads one run handles at most (D1 friendly). Defaults to `500`. */
    batch?: number
    /**
     * Days the provider ids of removed messages are remembered, so a replayed webhook is not stored again. Counted from
     * when retention or an erase removed them. Defaults to `365`.
     */
    tombstoneDays?: number
  }
  email?: {
    /** HMAC secret of `POST /api/inbox/webhooks/email` (`NUXT_INBOX_EMAIL_WEBHOOK_SECRET`). */
    webhookSecret?: string
    /**
     * The domains the inbox receives all mail for (`inbox.example.org`), overridden at run time by `NUXT_INBOX_DOMAINS`
     * (a comma separated list). A reply from an account on one goes out with the thread's reply address
     * (`support+ibt_...@inbox.example.org`), and an address on one that no account has is unknown (a bounce, where the
     * driver can send one). None by default.
     */
    domains?: string[]
    /**
     * The built-in inbound email drivers to install; several can be on at once. Defaults to `{ webhook: true }`.
     * - `webhook`: the signed JSON webhook, `POST /api/inbox/webhooks/email`.
     * - `cloudflare`: Cloudflare Email Routing to this Worker (the `cloudflare:email` hook of the `cloudflare-module`
     *   preset).
     * - `resend`: Resend's `email.received` webhook, `POST /api/inbox/email/resend`.
     * - `gmail`: Google Workspace mailboxes read through the Gmail API (push notifications through Pub/Sub,
     *   `POST /api/inbox/email/gmail`), for email accounts with `config.inbound: 'gmail'`.
     * - `imap`: IMAP mailboxes polled by the `inbox:imap` task, for email accounts with `config.inbound: 'imap'`.
     */
    inbound?: {
      webhook?: boolean
      cloudflare?: boolean | {
        /**
         * The authserv-ids of the `Authentication-Results` to trust (`NUXT_INBOX_CLOUDFLARE_AUTHSERV_IDS`, comma
         * separated). Defaults to `['mx.cloudflare.net']`.
         */
        authservIds?: string[]
        /**
         * Install a Worker entry that awaits the `cloudflare:email` hook, so an unknown recipient is bounced (Nitro 2's
         * entry runs it after Cloudflare accepted the email). Only on the `cloudflare-module` preset with its own entry.
         * Defaults to `true`.
         */
        entry?: boolean
      }
      gmail?: boolean | {
        /** The service account's `client_email` (`NUXT_INBOX_GMAIL_CLIENT_EMAIL`). */
        clientEmail?: string
        /** The service account's `private_key`, PEM (`NUXT_INBOX_GMAIL_PRIVATE_KEY`). */
        privateKey?: string
        /** The Pub/Sub topic Gmail publishes to, `projects/<project>/topics/<topic>` (`NUXT_INBOX_GMAIL_TOPIC`). */
        topic?: string
        /** The audience of the push subscription's OIDC token (`NUXT_INBOX_GMAIL_AUDIENCE`), e.g. the push URL. */
        audience?: string
        /** The service account the push subscription signs as; checked when set (`NUXT_INBOX_GMAIL_PUSH_SERVICE_ACCOUNT`). */
        pushServiceAccount?: string
        /** Defaults to `https://gmail.googleapis.com`. */
        apiBase?: string
        /** Cron of the `inbox:gmail` task (watch renewal and catch-up). Defaults to `'15 4 * * *'`; `false` for none. */
        cron?: string | false
      }
      imap?: boolean | {
        /** Cron of the `inbox:imap` task (the poll). Defaults to every five minutes; `false` for none. */
        cron?: string | false
      }
      resend?: boolean | {
        /** The webhook's signing secret, `whsec_...` (`NUXT_INBOX_RESEND_WEBHOOK_SECRET`). */
        webhookSecret?: string
        /** An API key that can read received emails (`NUXT_INBOX_RESEND_API_KEY`). */
        apiKey?: string
        /** Defaults to `https://api.resend.com`. */
        apiBase?: string
      }
    }
    /** Inbound email drivers of the host, next to the built-in ones and those of other modules (`extendInbox`). */
    drivers?: InboxEmailDriverDefinition[]
    /**
     * The Notify email driver replies go out through instead of Notify's own (`NUXT_INBOX_EMAIL_OUTBOUND`), with
     * Notify's settings: `cloudflare-binding` sends through a Workers `send_email` binding with a Message-ID of the
     * inbox's own, so answers thread by their headers. Other Notify mail is unchanged. Defaults to Notify's driver.
     */
    outbound?: InboxOutboundEmailDriver
  }
  meta?: {
    /** The Meta app secret: checks `X-Hub-Signature-256` (`NUXT_INBOX_META_APP_SECRET`). */
    appSecret?: string
    /** The verify token entered in the Meta app's webhook settings (`NUXT_INBOX_META_VERIFY_TOKEN`). */
    verifyToken?: string
    /** Defaults to `https://graph.facebook.com`. */
    apiBase?: string
    /** Defaults to `v21.0`. */
    apiVersion?: string
    /** Milliseconds a Graph API call may take. Defaults to `10000`. */
    timeoutMs?: number
  }
  /**
   * Channel account secrets by `secretRef` (access tokens). Declare each ref with an empty value and set it with the
   * `NUXT_INBOX_SECRETS_<REF>` environment variable, or set them all at once as JSON in `NUXT_INBOX_SECRETS`.
   */
  secrets?: Record<string, string>
  settings?: {
    pages?: {
      /** Staff thread list. `true` = `/admin/inbox`. Needs `@frigear-nu/admin`. */
      admin?: string | boolean
      /** Staff thread page; must contain `:id`. `true` = `/admin/inbox/threads/:id`. */
      adminThread?: string | boolean
      /** Mailbox and channel settings. `true` = `/admin/inbox/settings`. */
      adminSettings?: string | boolean
    }
    /** Add the `inbox.unassigned` and `inbox.mine` items to this dashboard when `@frigear-nu/dashboard` is installed. Defaults to `crew.home`; `false` adds none. */
    dashboard?: string | false
  }
}

export type PublicModuleOptions = {
  pages: { admin?: string, adminThread?: string, adminSettings?: string }
}

/** The server-only runtime config (`runtimeConfig.inbox`). */
export type InboxRuntimeConfig = {
  retention: { days: number | false, mode: InboxRetentionMode, batch: number, tombstoneDays: number }
  email: { webhookSecret: string, outbound: string }
  /** The authserv-ids Cloudflare Email Routing's `Authentication-Results` are trusted with (comma separated). */
  cloudflare: { authservIds: string }
  /** The Gmail driver: the service account (domain-wide delegation), the Pub/Sub topic and the push token's audience. */
  gmail: { clientEmail: string, privateKey: string, topic: string, audience: string, pushServiceAccount: string, apiBase: string }
  /** The inbox domains: `NUXT_INBOX_DOMAINS`, a comma separated list (read with `inboxDomains()`). */
  domains: string | string[]
  resend: { webhookSecret: string, apiKey: string, apiBase: string }
  meta: { appSecret: string, verifyToken: string, apiBase: string, apiVersion: string, timeoutMs: number }
  secrets: Record<string, string>
  mailboxes: InboxMailboxSeed[]
}
