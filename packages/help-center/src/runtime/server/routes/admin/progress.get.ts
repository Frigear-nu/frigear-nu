import { idParams, pageQuery } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import type { HelpProgressRow, HelpProgressSummary } from '../../../../types'

const querySchema = pageQuery({
  sort: ['name', 'readCount', 'lastReadAt'],
  defaultSort: 'readCount',
  defaultOrder: 'asc',
})

// Who read what on a checklist: people with how many of its articles they read, the ones who have not finished first.
// Needs `help-center:pii` (never covered by a wildcard): which articles a person read is personal data.
export default defineEventHandler(async (event): Promise<Page<HelpProgressRow> & HelpProgressSummary> => {
  await authorize(event, helpCenterAccess.permissions.pii)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const query = await getValidatedQuery(event, querySchema.parse)
  const row = await getHelpChecklistOr404(id)
  await authorize(event, helpCenterAccess.permissions.pii, row)
  return loadHelpChecklistProgress(event, row, query)
})
