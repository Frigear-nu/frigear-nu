import { db, schema } from '@nuxthub/db'
import { conflict, created } from '@frigear-nu/module-kit/server'
import type { Grant } from '@frigear-nu/grants/core'
import { newInboxId } from '../../../utils'
import { inboxAccess } from '../../../access'
import type { InboxMailboxDto } from '../../../../types'

// Creates a platform or team mailbox. A platform mailbox names who reads it in its grants (staff with `inbox:manage`
// always do); a team mailbox is read by the team's leads, and its grants may add others.
export default defineEventHandler(async (event): Promise<InboxMailboxDto> => {
  await authorize(event, inboxAccess.permissions.manage)
  const input = await readValidatedBody(event, inboxMailboxCreateInput.parse)
  const owner = await inboxCheckMailboxOwner(event, input.ownerType, input.ownerId ?? null)
  const grants = await inboxCheckMailboxGrants(event, input.ownerType, (input.grants ?? []) as Grant[])
  if (await findInboxMailboxByKey(input.key)) throw conflict('A mailbox with this key already exists.', { field: 'key' })

  const [row] = await db.insert(schema.inboxMailboxes).values({
    id: newInboxId('ibx'),
    key: input.key,
    ownerType: input.ownerType,
    ownerId: owner,
    name: input.name,
    grants,
    retentionDays: input.retentionDays ?? null,
  }).onConflictDoNothing().returning()
  if (!row) throw conflict('A mailbox with this key already exists.', { field: 'key' })
  return created(event, toInboxMailboxDto(row))
})
