import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// (declared here, not imported: this file is merged into the generated schema as plain text)
// A text in one language, or a `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
type Translated = string | Record<string, string>
// Who may read a record, see `Grant` of `@frigear-nu/auth`.
type Grant = { kind: string } & Record<string, unknown>
// A file on a message: a Blob pathname or a provider URL, never the bytes.
type InboxAttachment = { filename: string, contentType?: string, size?: number, pathname?: string, url?: string }

export const inboxMailboxes = sqliteTable('inbox_mailboxes', {
  /** `ibx_` + random id. */
  id: text().primaryKey(),
  /** Stable name for code and seeds (`support`), unique. */
  key: text().notNull().unique(),
  /** `platform | team | user` (only `platform` and `team` are used for now). */
  ownerType: text().notNull(),
  /** The owner's id as text; `null` for `platform`. */
  ownerId: text(),
  name: text({ mode: 'json' }).$type<Translated>().notNull(),
  /** Who may read it (`@frigear-nu/auth`): any one grant admits, an empty list admits nobody. */
  grants: text({ mode: 'json' }).$type<Grant[]>().notNull().default([]),
  /** Days a closed thread is kept; `null` takes the module's `retention.days`. */
  retentionDays: integer(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('inbox_mailbox_owner_idx').on(t.ownerType, t.ownerId),
])

export const inboxChannelAccounts = sqliteTable('inbox_channel_accounts', {
  /** `ica_` + random id. */
  id: text().primaryKey(),
  mailboxId: text().notNull().references(() => inboxMailboxes.id, { onDelete: 'cascade' }),
  /** A registered channel id (`email`, `whatsapp`, ...). */
  channel: text().notNull(),
  /** The identity on the channel (email address, phone number id, page id, form slug), unique per channel. */
  address: text().notNull(),
  /** Settings that are not secret. */
  config: text({ mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  /** The name of a secret in the runtime config or environment; never the secret itself. */
  secretRef: text(),
  enabled: integer({ mode: 'boolean' }).notNull().default(true),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('inbox_channel_address_idx').on(t.channel, t.address),
  index('inbox_channel_mailbox_idx').on(t.mailboxId),
])

export const inboxContacts = sqliteTable('inbox_contacts', {
  /** `icn_` + random id. */
  id: text().primaryKey(),
  channel: text().notNull(),
  /** Who the person is on the channel (email address, WhatsApp id, page-scoped id); `erased:<id>` once erased. */
  externalId: text().notNull(),
  name: text(),
  email: text(),
  phone: text(),
  /** The signed-in user who wrote, when known. */
  userId: integer(),
  erasedAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  uniqueIndex('inbox_contact_external_idx').on(t.channel, t.externalId),
  index('inbox_contact_user_idx').on(t.userId),
])

export const inboxThreads = sqliteTable('inbox_threads', {
  /** `ibt_` + random id. */
  id: text().primaryKey(),
  mailboxId: text().notNull().references(() => inboxMailboxes.id, { onDelete: 'cascade' }),
  contactId: text().notNull().references(() => inboxContacts.id),
  /** The account replies go out through; `null` once the account is deleted. */
  channelAccountId: text().references(() => inboxChannelAccounts.id, { onDelete: 'set null' }),
  channel: text().notNull(),
  subject: text(),
  /** `subject` folded for search (`searchText` of `@frigear-nu/module-kit/server`); cleared with it. */
  searchText: text().notNull().default(''),
  /** `open | pending | closed`. */
  status: text().notNull().default('open'),
  assigneeId: integer(),
  /** `null`, or the lowest global role that sees the thread. */
  hiddenBelow: text(),
  /** The start of the last message that is not a note, for the thread list. */
  preview: text(),
  lastMessageAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  /** When retention or an erase blanked its messages. */
  anonymisedAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('inbox_thread_mailbox_idx').on(t.mailboxId, t.status),
  index('inbox_thread_assignee_idx').on(t.assigneeId),
  index('inbox_thread_contact_idx').on(t.contactId),
  index('inbox_thread_last_idx').on(t.lastMessageAt),
])

export const inboxMessages = sqliteTable('inbox_messages', {
  /** `ibm_` + random id. */
  id: text().primaryKey(),
  threadId: text().notNull().references(() => inboxThreads.id, { onDelete: 'cascade' }),
  /** `in | out | note`. */
  direction: text().notNull(),
  /** The staff member who replied or wrote the note. */
  authorId: integer(),
  body: text().notNull(),
  attachments: text({ mode: 'json' }).$type<InboxAttachment[]>().notNull(),
  /**
   * Email `Cc` recipients (lower case, valid addresses only): who an inbound message copied (the mailbox's own address
   * left out), or who a reply copied. `null` otherwise.
   */
  cc: text({ mode: 'json' }).$type<string[]>(),
  /**
   * The channel account the message came in on or went out through. No foreign key: it stays when the account is
   * deleted, so the account's provider ids keep their meaning.
   */
  channelAccountId: text(),
  /** `<channel>:<provider id>`, unique per channel account: a webhook delivered twice stores one message. */
  externalId: text(),
  /**
   * The contact who sent an inbound message (`null` for replies and notes). Usually the thread's contact; a reply by
   * email to a contact form thread is filed under the form's contact but sent by the email contact, and exports and
   * erases find it by this column.
   */
  contactId: text(),
  /** Whether the channel verified the sender of an inbound message (see `InboxInboundMessage.authenticated`). */
  authenticated: integer({ mode: 'boolean' }).notNull().default(false),
  /** Epoch milliseconds: orders a thread's messages (`createdAt` has whole seconds on sqlite). */
  createdAtMs: integer().notNull().$defaultFn(() => Date.now()),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('inbox_message_thread_idx').on(t.threadId, t.createdAtMs),
  uniqueIndex('inbox_message_external_idx').on(t.channelAccountId, t.externalId),
  index('inbox_message_contact_idx').on(t.contactId),
])

export const inboxAudit = sqliteTable('inbox_audit', {
  /** `iba_` + random id. */
  id: text().primaryKey(),
  /** No foreign key: the log outlives deleted threads. */
  threadId: text(),
  /** The thread's mailbox (or the mailbox of a retention run): the log is filtered by mailbox access. */
  mailboxId: text(),
  contactId: text(),
  actorId: integer(),
  /** `viewed | replied | noted | assigned | status | hidden | exported | erased | retention`. */
  action: text().notNull(),
  data: text({ mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('inbox_audit_thread_idx').on(t.threadId),
  index('inbox_audit_contact_idx').on(t.contactId),
  index('inbox_audit_mailbox_idx').on(t.mailboxId),
  index('inbox_audit_created_idx').on(t.createdAt),
])

/**
 * Provider ids of inbound messages that retention or an erase removed, so a webhook replayed later is not stored again.
 * Retention's are pruned `retention.tombstoneDays` after they were written; an erase's are kept for good (`permanent`).
 */
export const inboxTombstones = sqliteTable('inbox_tombstones', {
  /** Hex SHA-256 of `<channel account id>:<external id>`: no provider id or address is kept in the clear. */
  key: text().primaryKey(),
  /** The contact who sent the message (no foreign key: the tombstone outlives the contact). */
  contactId: text(),
  /** Written by an erase (GDPR): never pruned, so a replay can never bring the message back. */
  permanent: integer({ mode: 'boolean' }).notNull().default(false),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('inbox_tombstone_created_idx').on(t.createdAt),
  index('inbox_tombstone_contact_idx').on(t.contactId),
])

/**
 * Where an inbound email driver that fetches mail itself left off, per email account: the Gmail driver's history id and
 * watch expiry, the IMAP driver's UIDVALIDITY and last seen UID. Deleted with the account.
 */
export const inboxEmailCursors = sqliteTable('inbox_email_cursors', {
  /** `<driver>:<channel account id>`. */
  key: text().primaryKey(),
  channelAccountId: text().notNull().references(() => inboxChannelAccounts.id, { onDelete: 'cascade' }),
  /** The driver's name (`gmail`, `imap`). */
  driver: text().notNull(),
  /** The driver's own state (no secrets). */
  state: text({ mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('inbox_email_cursor_account_idx').on(t.channelAccountId),
])
