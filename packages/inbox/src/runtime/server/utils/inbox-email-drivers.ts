import { db, schema } from '@nuxthub/db'
import { inArray } from 'drizzle-orm'
import { drivers } from '#inbox/email-drivers'
import { blob } from '#inbox/blob'
import { sha256Hex } from '@frigear-nu/module-kit/crypto'
import type { InboxAttachment, InboxEmailDriver } from '../../../types'

// The inbound email drivers built at build time from the built-ins (`inbox.email.inbound`), every `extendInbox` call
// and `inbox.email.drivers` (`#inbox/email-drivers`), and the files they receive.

/** A registered inbound email driver, or `undefined`. */
export function inboxEmailDriver(name: string): InboxEmailDriver | undefined {
  return Object.hasOwn(drivers, name) ? drivers[name] : undefined
}

/** The names of the registered inbound email drivers (the signed JSON webhook is not one of them). */
export function inboxEmailDriverNames(): string[] {
  return Object.keys(drivers)
}

/** Whether received files are stored (NuxtHub Blob is on); without it an attachment is only named on the message. */
export function inboxCanStoreAttachments(): boolean {
  return !!blob
}

/** A file of a received email, with its bytes. */
export type InboxEmailFile = { filename: string, contentType: string, content: Uint8Array }

/** Replaces anything but letters, digits, `.`, `_` and `-` in a file name, for a Blob pathname. */
function safeName(filename: string): string {
  return filename.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^[._]+/, '').slice(-100) || 'file'
}

/**
 * Stores the files of a received email in NuxtHub Blob, under `inbox/email/<hash of the Message-ID>/` with stable
 * names, so a redelivery overwrites them rather than storing them twice, and answers them as message attachments
 * (`pathname`). Without Blob, the files are only named (file name, type and size). At most 50 files.
 */
export async function inboxStoreEmailFiles(messageId: string, files: readonly InboxEmailFile[]): Promise<InboxAttachment[]> {
  const list = files.slice(0, 50)
  if (!blob) return list.map(file => ({ filename: file.filename, contentType: file.contentType, size: file.content.byteLength }))
  const folder = `inbox/email/${(await sha256Hex(messageId)).slice(0, 32)}`
  const stored: InboxAttachment[] = []
  for (const [index, file] of list.entries()) {
    const saved = await blob.put(`${folder}/${index + 1}-${safeName(file.filename)}`, file.content, { contentType: file.contentType })
    stored.push({ filename: file.filename, contentType: file.contentType, size: file.content.byteLength, pathname: saved.pathname })
  }
  return stored
}

/**
 * Deletes the files the email drivers stored (`inbox/email/...` in Blob) of these messages (by message id or thread id,
 * one D1-sized chunk), before retention or an erase blanks or deletes the messages. Files a form stored belong to
 * Forms and stay. A file that cannot be deleted is logged; the messages are still blanked.
 */
export async function inboxDeleteEmailFiles(where: { threadIds?: string[], messageIds?: string[] }): Promise<void> {
  if (!blob) return
  const condition = where.threadIds ? inArray(schema.inboxMessages.threadId, where.threadIds) : where.messageIds ? inArray(schema.inboxMessages.id, where.messageIds) : undefined
  if (!condition) return
  const rows = await db.select({ attachments: schema.inboxMessages.attachments }).from(schema.inboxMessages).where(condition)
  const pathnames: string[] = rows.flatMap((row: { attachments: InboxAttachment[] | null }) => (row.attachments ?? []).map(file => file.pathname))
    .filter((pathname): pathname is string => typeof pathname === 'string' && pathname.startsWith('inbox/email/'))
  if (!pathnames.length) return
  try {
    await blob.del([...new Set<string>(pathnames)])
  }
  catch (error) {
    console.error('[inbox] could not delete the stored files of erased messages', error)
  }
}
