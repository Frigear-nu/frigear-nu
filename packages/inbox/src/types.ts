import type { H3Event } from 'h3'
import type { OwnerRef, Visibility } from '@frigear-nu/audience'

export type { OwnerRef, Visibility }

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

/** What a channel's `send` may return: the provider's id of the sent message. */
export type InboxSendResult = { externalId?: string | null } | undefined

/** A channel adapter, the default export of the file `extendInbox` names. */
export type InboxChannelAdapter = {
  id: string
  label?: Translated
  /**
   * Reads a webhook on `POST /api/inbox/webhooks/:channel` and returns the messages in it. Verify the request here
   * (throw a 401 when the signature is wrong). Built-in channels have routes of their own instead.
   */
  inbound?: (event: H3Event) => InboxInboundMessage[] | Promise<InboxInboundMessage[]>
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

export type InboxExtension = { channels?: InboxChannelDefinition[] }

// --- DTOs --------------------------------------------------------------------------------------------------------------

export type InboxMailboxDto = {
  id: string
  key: string
  ownerType: InboxMailboxOwnerType
  ownerId: string | null
  name: Translated
  visibility: Visibility | null
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
  /** Email `Cc` recipients of an inbound message; only with `inbox:pii`. */
  cc?: string[] | null
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

export type InboxAuditAction = 'viewed' | 'replied' | 'noted' | 'assigned' | 'status' | 'hidden' | 'exported' | 'erased' | 'retention'

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
  threads: Array<{ thread: InboxThreadDto, messages: Array<Omit<InboxMessageDto, 'author'>> }>
  exportedAt: string
}

export type InboxRetentionResult = { mailboxes: number, threads: number, contacts: number, mode: InboxRetentionMode }

// --- Hooks -------------------------------------------------------------------------------------------------------------

export type InboxMessageContext = { event: H3Event, thread: InboxThreadDto, message: InboxMessageDto }
export type InboxThreadAssignedContext = { event: H3Event, thread: InboxThreadDto, assigneeId: number | null, previous: number | null }
export type InboxThreadStatusContext = { event: H3Event, thread: InboxThreadDto, from: InboxThreadStatus, to: InboxThreadStatus }

// --- Options -----------------------------------------------------------------------------------------------------------

export type InboxRetentionMode = 'delete' | 'anonymise'

export type InboxMailboxSeed = {
  key: string
  name: Translated
  ownerType?: 'platform' | 'team'
  ownerId?: string | null
  visibility?: Visibility | null
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
  email: { webhookSecret: string }
  meta: { appSecret: string, verifyToken: string, apiBase: string, apiVersion: string, timeoutMs: number }
  secrets: Record<string, string>
  mailboxes: InboxMailboxSeed[]
}
