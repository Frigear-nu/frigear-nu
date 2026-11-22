import { pgTable, text, integer, bigint, boolean, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'

// (declared here, not imported: this file is merged into the generated schema as plain text)
// A text in one language, or a `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
type Translated = string | Record<string, string>
// Who may read a record, see `Grant` of `@frigear-nu/auth`.
type Grant = { kind: string } & Record<string, unknown>
// A file on a message: a Blob pathname or a provider URL, never the bytes.
type InboxAttachment = { filename: string, contentType?: string, size?: number, pathname?: string, url?: string }

export const inboxMailboxes = pgTable('inbox_mailboxes', {
  /** `ibx_` + random id. */
  id: text().primaryKey(),
  /** Stable name for code and seeds (`support`), unique. */
  key: text().notNull().unique(),
  /** `platform | team | user` (only `platform` and `team` are used for now). */
  ownerType: text().notNull(),
  /** The owner's id as text; `null` for `platform`. */
  ownerId: text(),
  name: jsonb().$type<Translated>().notNull(),
  /** Who may read it (`@frigear-nu/auth`): any one grant admits, an empty list admits nobody. */
  grants: jsonb().$type<Grant[]>().notNull().default([]),
  /** Days a closed thread is kept; `null` takes the module's `retention.days`. */
  retentionDays: integer(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('inbox_mailbox_owner_idx').on(t.ownerType, t.ownerId),
])

export const inboxChannelAccounts = pgTable('inbox_channel_accounts', {
  /** `ica_` + random id. */
  id: text().primaryKey(),
  mailboxId: text().notNull().references(() => inboxMailboxes.id, { onDelete: 'cascade' }),
  /** A registered channel id (`email`, `whatsapp`, ...). */
  channel: text().notNull(),
  /** The identity on the channel (email address, phone number id, page id, form slug), unique per channel. */
  address: text().notNull(),
  /** Settings that are not secret. */
  config: jsonb().$type<Record<string, unknown>>().notNull(),
  /** The name of a secret in the runtime config or environment; never the secret itself. */
  secretRef: text(),
  enabled: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('inbox_channel_address_idx').on(t.channel, t.address),
  index('inbox_channel_mailbox_idx').on(t.mailboxId),
])

export const inboxContacts = pgTable('inbox_contacts', {
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
  erasedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, t => [
  uniqueIndex('inbox_contact_external_idx').on(t.channel, t.externalId),
  index('inbox_contact_user_idx').on(t.userId),
])

export const inboxThreads = pgTable('inbox_threads', {
  /** `ibt_` + random id. */
  id: text().primaryKey(),
  mailboxId: text().notNull().references(() => inboxMailboxes.id, { onDelete: 'cascade' }),
  contactId: text().notNull().references(() => inboxContacts.id),
  /** The account replies go out through; `null` once the account is deleted. */
  channelAccountId: text().references(() => inboxChannelAccounts.id, { onDelete: 'set null' }),
  channel: text().notNull(),
  subject: text(),
  /** `open | pending | closed`. */
  status: text().notNull().default('open'),
  assigneeId: integer(),
  /** `null`, or the lowest global role that sees the thread. */
  hiddenBelow: text(),
  /** The start of the last message that is not a note, for the thread list. */
  preview: text(),
  lastMessageAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  /** When retention or an erase blanked its messages. */
  anonymisedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('inbox_thread_mailbox_idx').on(t.mailboxId, t.status),
  index('inbox_thread_assignee_idx').on(t.assigneeId),
  index('inbox_thread_contact_idx').on(t.contactId),
  index('inbox_thread_last_idx').on(t.lastMessageAt),
])

export const inboxMessages = pgTable('inbox_messages', {
  /** `ibm_` + random id. */
  id: text().primaryKey(),
  threadId: text().notNull().references(() => inboxThreads.id, { onDelete: 'cascade' }),
  /** `in | out | note`. */
  direction: text().notNull(),
  /** The staff member who replied or wrote the note. */
  authorId: integer(),
  body: text().notNull(),
  attachments: jsonb().$type<InboxAttachment[]>().notNull(),
  /** Email `Cc` recipients of an inbound message (lower case, the mailbox's own address left out); `null` otherwise. */
  cc: jsonb().$type<string[]>(),
  /**
   * The channel account the message came in on or went out through. No foreign key: it stays when the account is
   * deleted, so the account's provider ids keep their meaning.
   */
  channelAccountId: text(),
  /** `<channel>:<provider id>`, unique per channel account: a webhook delivered twice stores one message. */
  externalId: text(),
  /** Epoch milliseconds: orders a thread's messages (`createdAt` has whole seconds on sqlite). */
  createdAtMs: bigint({ mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('inbox_message_thread_idx').on(t.threadId, t.createdAtMs),
  uniqueIndex('inbox_message_external_idx').on(t.channelAccountId, t.externalId),
])

export const inboxAudit = pgTable('inbox_audit', {
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
  data: jsonb().$type<Record<string, unknown>>(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('inbox_audit_thread_idx').on(t.threadId),
  index('inbox_audit_contact_idx').on(t.contactId),
  index('inbox_audit_mailbox_idx').on(t.mailboxId),
  index('inbox_audit_created_idx').on(t.createdAt),
])

/**
 * Provider ids of inbound messages that retention or an erase removed, so a webhook replayed later is not stored again.
 * Pruned `retention.tombstoneDays` after they were written.
 */
export const inboxTombstones = pgTable('inbox_tombstones', {
  /** Hex SHA-256 of `<channel account id>:<external id>`: no provider id or address is kept in the clear. */
  key: text().primaryKey(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('inbox_tombstone_created_idx').on(t.createdAt),
])
