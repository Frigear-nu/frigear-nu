import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { idParams } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxMailboxDto } from '../../../../types'

// Renames a mailbox, changes who reads it or how long it keeps closed threads.
export default defineEventHandler(async (event): Promise<InboxMailboxDto> => {
  await authorize(event, inboxAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, inboxMailboxPatchInput.parse)
  const row = await getInboxMailboxOr404(id)

  const values: Partial<typeof schema.inboxMailboxes.$inferInsert> = {}
  if (input.name !== undefined) values.name = input.name
  if (input.visibility !== undefined) values.visibility = inboxCheckMailboxVisibility(row.ownerType, input.visibility)
  if (input.retentionDays !== undefined) values.retentionDays = input.retentionDays
  if (!Object.keys(values).length) return toInboxMailboxDto(row)
  const [updated] = await db.update(schema.inboxMailboxes).set(values).where(eq(schema.inboxMailboxes.id, row.id)).returning()
  return toInboxMailboxDto(updated!)
})
