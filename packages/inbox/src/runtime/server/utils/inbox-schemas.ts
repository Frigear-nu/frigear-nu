import { z } from 'zod'
import { grantListShape } from '@frigear-nu/grants/core'
import { pageQuery } from '@frigear-nu/module-kit/server'
import { INBOX_CHANNEL_ID } from '../../utils/registry'

// Request schemas of the inbox routes.

/** A mailbox key: letters, digits, `.`, `_` and `-`, starting with a letter or digit. */
export const inboxKeySchema = z.string().trim().regex(/^[a-z0-9][\w.-]{0,63}$/i, 'Use letters, digits, ".", "_" and "-".')

/** A text in one language, or a locale -> text map with at least one text. */
export const inboxTranslatedInput = (max = 200) => z.union([
  z.string().trim().min(1).max(max),
  z.record(z.string().min(2).max(16), z.string().trim().max(max))
    .refine(value => Object.values(value).some(Boolean), 'Write the text in at least one language.'),
])

export const inboxStatusSchema = z.enum(['open', 'pending', 'closed'])
export const inboxRoleSchema = z.string().trim().min(1).max(64)

/** `POST /api/admin/inbox/mailboxes`. A platform mailbox needs grants that name who reads it (checked in the handler). */
export const inboxMailboxCreateInput = z.object({
  key: inboxKeySchema,
  name: inboxTranslatedInput(),
  ownerType: z.enum(['platform', 'team']).default('platform'),
  ownerId: z.string().trim().min(1).max(128).nullish(),
  grants: grantListShape.optional(),
  retentionDays: z.number().int().min(1).max(36_500).nullish(),
})

/** `PATCH /api/admin/inbox/mailboxes/:id`. The owner never changes; the key does not either (code finds mailboxes by it). */
export const inboxMailboxPatchInput = z.object({
  name: inboxTranslatedInput().optional(),
  grants: grantListShape.optional(),
  retentionDays: z.number().int().min(1).max(36_500).nullable().optional(),
})

/** `GET /api/admin/inbox/threads`. `status` defaults to `active` (open or pending), `all` lists every status; `assignee`: `me`, `none` or a user id. */
export const inboxThreadsQuery = pageQuery({
  sort: ['lastMessageAt', 'createdAt', 'status'],
  defaultSort: 'lastMessageAt',
  // A page's ids go into one `IN (...)`: D1 binds at most 100 parameters.
  maxPageSize: 90,
  filters: {
    mailbox: z.string().trim().min(1).max(64).optional(),
    status: z.enum(['open', 'pending', 'closed', 'active', 'all']).default('active'),
    assignee: z.union([z.literal('me'), z.literal('none'), z.coerce.number().int().positive()]).optional(),
    channel: z.string().trim().min(1).max(64).optional(),
  },
})

/** `PATCH /api/admin/inbox/threads/:id`: the status (`inbox:reply`) and the assignee (`inbox:assign`). */
export const inboxThreadPatchInput = z.object({
  status: inboxStatusSchema.optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
}).refine(value => value.status !== undefined || value.assigneeId !== undefined, 'Change the status or the assignee.')

/** `POST .../messages` and `.../notes`. A reply may set the status in the same call (`pending`: waiting for them). */
export const inboxMessageInput = z.object({
  body: z.string().trim().min(1).max(20_000),
  status: inboxStatusSchema.optional(),
})

export const inboxNoteInput = z.object({
  body: z.string().trim().min(1).max(20_000),
})

/** `POST .../hide`: the lowest global role that still sees the thread, or `null` to show it again. */
export const inboxHideInput = z.object({
  role: inboxRoleSchema.nullable(),
})

/** Only setting keys, never secrets: a value named like a secret is refused. */
const configSchema = z.record(z.string().min(1).max(64), z.unknown())
  .refine(value => !Object.keys(value).some(key => /secret|token|password|apikey|api_key/i.test(key)), 'Put secrets in the runtime config and name them in secretRef.')
  .refine(value => JSON.stringify(value).length <= 4000, 'The settings are too long.')

/** `POST /api/admin/inbox/channels`. */
export const inboxChannelCreateInput = z.object({
  mailboxId: z.string().trim().min(1).max(64),
  channel: z.string().trim().regex(INBOX_CHANNEL_ID, 'Unknown channel.').max(64),
  address: z.string().trim().min(1).max(320),
  config: configSchema.default({}),
  secretRef: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,63}$/, 'Upper case letters, digits and "_", such as WHATSAPP_TOKEN.').nullish(),
  enabled: z.boolean().default(true),
})

/** `PATCH /api/admin/inbox/channels/:id`. The channel and the mailbox never change. */
export const inboxChannelPatchInput = z.object({
  address: z.string().trim().min(1).max(320).optional(),
  config: configSchema.optional(),
  secretRef: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,63}$/, 'Upper case letters, digits and "_", such as WHATSAPP_TOKEN.').nullable().optional(),
  enabled: z.boolean().optional(),
})

/** `GET /api/admin/inbox/threads/:id/assignees`: `q` narrows by name. */
export const inboxAssigneesQuery = z.object({
  q: z.string().trim().max(100).optional().transform(value => value || undefined),
})

/** `GET /api/admin/inbox/audit`. */
export const inboxAuditQuery = pageQuery({
  sort: ['createdAt'],
  defaultPageSize: 50,
  filters: {
    threadId: z.string().trim().min(1).max(64).optional(),
    contactId: z.string().trim().min(1).max(64).optional(),
    action: z.string().trim().min(1).max(32).optional(),
  },
})

/** `:channel` of the module webhooks. */
export const inboxChannelParams = z.object({ channel: z.string().trim().regex(INBOX_CHANNEL_ID).max(64) })
