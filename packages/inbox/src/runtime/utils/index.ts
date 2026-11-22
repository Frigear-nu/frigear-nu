// Build-time utils and pure helpers, safe to import from another module's `setup()` (no `@nuxt/kit` import) as well as
// from the Vue app and Nitro code.
import type { Nuxt } from '@nuxt/schema'
import type { InboxChannelAdapter, InboxChannelDefinition, InboxExtension } from '../../types'

export * from './api'
export * from './signature'
export * from './payloads'
export { buildInboxRegistry, INBOX_CHANNEL_ID } from './registry'
export type { BuiltInboxRegistry } from './registry'

export type {
  InboxAttachment,
  InboxAuditAction,
  InboxAuditDto,
  InboxBuiltInChannel,
  InboxChannelAccountDto,
  InboxChannelAdapter,
  InboxChannelDefinition,
  InboxChannelId,
  InboxChannelInfo,
  InboxContactDetails,
  InboxContactDto,
  InboxContactExportDto,
  InboxExtension,
  InboxInboundContext,
  InboxInboundMessage,
  InboxMailboxDto,
  InboxMailboxOwnerType,
  InboxMailboxSeed,
  InboxMessageContext,
  InboxMessageDirection,
  InboxMessageDto,
  InboxRetentionMode,
  InboxRetentionResult,
  InboxSendContext,
  InboxSendResult,
  InboxSummaryDto,
  InboxThreadAbilities,
  InboxThreadAssignedContext,
  InboxThreadDetailDto,
  InboxThreadDto,
  InboxThreadListItemDto,
  InboxThreadStatus,
  InboxThreadStatusContext,
  InboxUserRef,
  ModuleOptions,
  Translated,
} from '../../types'

/** Thread statuses, in the order the UI lists them. */
export const INBOX_THREAD_STATUSES = ['open', 'pending', 'closed'] as const

/** English fallbacks of the status labels (`inbox.status.*`). */
export const INBOX_STATUS_LABELS: Record<string, string> = { open: 'Open', pending: 'Pending', closed: 'Closed' }

/** English fallbacks of the audit actions (`inbox.audit.actions.*`). */
export const INBOX_AUDIT_LABELS: Record<string, string> = {
  viewed: 'Viewed',
  replied: 'Replied',
  noted: 'Added a note',
  assigned: 'Assigned',
  status: 'Changed the status',
  hidden: 'Changed who sees it',
  exported: 'Exported the contact',
  erased: 'Erased the contact',
  retention: 'Retention',
}

type InboxExtensions = { inbox?: { _extensions?: InboxExtension[] } | false }

/**
 * Types a channel adapter: the default export of the server file a channel registration names. `send` delivers a
 * reply; `inbound` (optional) reads `POST /api/inbox/webhooks/:channel`.
 *
 * ```ts
 * export default defineInboxChannel({
 *   id: 'acme.sms',
 *   async send({ contact, message, secret }) {
 *     const sent = await $fetch('https://sms.example/send', { method: 'POST', headers: { authorization: `Bearer ${secret}` }, body: { to: contact.phone, text: message.body } })
 *     return { externalId: sent.id }
 *   },
 * })
 * ```
 */
export const defineInboxChannel = (adapter: InboxChannelAdapter): InboxChannelAdapter => adapter

/** Types a channel registration (for registrations kept in their own file). */
export const defineInboxChannelRegistration = (channel: InboxChannelDefinition): InboxChannelDefinition => channel

/**
 * Registers channels from a module's `setup()`. Order between modules does not matter: the inbox reads them once every
 * module is done. A channel with an id that exists already replaces it; an invalid one fails the build.
 *
 * ```ts
 * import { extendInbox } from '@frigear-nu/inbox/utils'
 *
 * extendInbox(nuxt, {
 *   channels: [{ id: 'acme.sms', label: { da: 'SMS', en: 'Text message' }, icon: 'i-lucide-message-square', adapter: resolver.resolve('./runtime/inbox/sms') }],
 * })
 * ```
 */
export function extendInbox(nuxt: Nuxt, extension: InboxExtension): void {
  const options = nuxt.options as unknown as InboxExtensions
  if (options.inbox === false) return
  options.inbox ||= {}
  const list = options.inbox._extensions ||= []
  list.push({ channels: [...(extension.channels ?? [])] })
}
