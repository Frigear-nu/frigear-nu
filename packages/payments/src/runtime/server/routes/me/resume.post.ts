import { idParams } from '@frigear-nu/module-kit/server'
import type { ResumeResponse } from '../../../../types'

// Resume paying for one of the caller's unpaid payments: answers with the checkout URL to continue at.
export default defineEventHandler(async (event): Promise<ResumeResponse> => {
  const user = await requireUser(event, { scopes: ['payments:write'] })
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  return resumePayment(id, user.id, event)
})
