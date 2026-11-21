import type { schema } from '@nuxthub/db'
import { isoDate } from '@frigear-nu/module-kit/server'
import { readGrants } from '@frigear-nu/grants/core'
import type {
  InboxAuditAction,
  InboxAuditDto,
  InboxChannelAccountDto,
  InboxContactDetails,
  InboxContactDto,
  InboxMailboxDto,
  InboxMailboxOwnerType,
  InboxMessageDirection,
  InboxMessageDto,
  InboxThreadDto,
  InboxThreadStatus,
  InboxUserRef,
} from '../../../types'

export type InboxMailboxRow = typeof schema.inboxMailboxes.$inferSelect
export type InboxChannelAccountRow = typeof schema.inboxChannelAccounts.$inferSelect
export type InboxContactRow = typeof schema.inboxContacts.$inferSelect
export type InboxThreadRow = typeof schema.inboxThreads.$inferSelect
export type InboxMessageRow = typeof schema.inboxMessages.$inferSelect
export type InboxAuditRow = typeof schema.inboxAudit.$inferSelect

// Every response is one of these allowlisted shapes, never a database row.

export function toInboxMailboxDto(row: InboxMailboxRow): InboxMailboxDto {
  return {
    id: row.id,
    key: row.key,
    ownerType: row.ownerType as InboxMailboxOwnerType,
    ownerId: row.ownerId ?? null,
    name: row.name,
    grants: readGrants(row.grants),
    retentionDays: row.retentionDays ?? null,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

/** `secretConfigured` says whether the ref resolves on this server; the secret itself never leaves it. */
export function toInboxChannelAccountDto(row: InboxChannelAccountRow, secretConfigured: boolean): InboxChannelAccountDto {
  return {
    id: row.id,
    mailboxId: row.mailboxId,
    channel: row.channel,
    address: row.address,
    config: row.config ?? {},
    secretRef: row.secretRef ?? null,
    secretConfigured,
    enabled: row.enabled,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

/** A contact; the details only with `inbox:pii`. */
export function toInboxContactDto(row: InboxContactRow, pii: boolean): InboxContactDto {
  return {
    id: row.id,
    channel: row.channel,
    name: row.name ?? null,
    erasedAt: isoDate(row.erasedAt),
    ...(pii ? { email: row.email ?? null, phone: row.phone ?? null, externalId: row.erasedAt ? null : row.externalId, userId: row.userId ?? null } : {}),
  }
}

/** Every detail of a contact, for channels (to reach the person) and exports. */
export function toInboxContactDetails(row: InboxContactRow): InboxContactDetails {
  return {
    id: row.id,
    channel: row.channel,
    externalId: row.externalId,
    name: row.name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    userId: row.userId ?? null,
  }
}

export function toInboxThreadDto(row: InboxThreadRow): InboxThreadDto {
  return {
    id: row.id,
    mailboxId: row.mailboxId,
    contactId: row.contactId,
    channelAccountId: row.channelAccountId ?? null,
    channel: row.channel,
    subject: row.subject ?? null,
    status: row.status as InboxThreadStatus,
    assigneeId: row.assigneeId ?? null,
    hiddenBelow: row.hiddenBelow ?? null,
    lastMessageAt: isoDate(row.lastMessageAt),
    anonymisedAt: isoDate(row.anonymisedAt),
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

/** A message; its cc recipients (other people's addresses) only with `pii`. */
export function toInboxMessageDto(row: InboxMessageRow, author: InboxUserRef | null = null, pii = false): InboxMessageDto {
  return {
    id: row.id,
    threadId: row.threadId,
    direction: row.direction as InboxMessageDirection,
    authorId: row.authorId ?? null,
    author,
    body: row.body,
    attachments: row.attachments ?? [],
    ...(pii ? { cc: row.cc?.length ? row.cc : null } : {}),
    createdAt: isoDate(row.createdAt),
  }
}

export function toInboxAuditDto(row: InboxAuditRow, actor: InboxUserRef | null = null): InboxAuditDto {
  return {
    id: row.id,
    threadId: row.threadId ?? null,
    contactId: row.contactId ?? null,
    actorId: row.actorId ?? null,
    actor,
    action: row.action as InboxAuditAction,
    data: row.data ?? null,
    createdAt: isoDate(row.createdAt),
  }
}
