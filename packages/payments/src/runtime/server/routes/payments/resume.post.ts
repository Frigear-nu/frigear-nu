import { z } from 'zod'
import type { ResumeResponse } from '../../../../types'

const bodySchema = z.object({ paymentId: z.string().min(1) })

export default defineEventHandler(async (event): Promise<ResumeResponse> => {
  const { user } = await requireUserSession(event)
  const { paymentId } = await readValidatedBody(event, bodySchema.parse)
  return resumePayment(paymentId, user.id, event)
})
