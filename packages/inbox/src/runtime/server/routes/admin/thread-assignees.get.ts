import { idParams } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxUserRef } from '../../../../types'

// The people a thread can be assigned to: those who could read and answer it themselves (its mailbox and its
// `hiddenBelow` role, evaluated for each of them), by name, `?q` narrowing by name. At most 50. The assignment itself
// checks again (409 `assignee_no_access`).
export default defineEventHandler(async (event): Promise<InboxUserRef[]> => {
  await authorize(event, inboxAccess.permissions.read)
  await authorize(event, inboxAccess.permissions.assign)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const { q } = await getValidatedQuery(event, inboxAssigneesQuery.parse)
  const thread = await getReadableInboxThreadOr404(event, id)
  await authorize(event, inboxAccess.permissions.assign, thread)
  return inboxAssigneeCandidates(event, thread, { q })
})
