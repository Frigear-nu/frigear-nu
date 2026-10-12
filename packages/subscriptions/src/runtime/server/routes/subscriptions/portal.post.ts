import { z } from 'zod'
import { resolveSameOriginUrl } from '../../../utils/plans'
import type { PortalBody } from '../../../../types'

const bodySchema = z.object({ returnUrl: z.string().optional() }) satisfies z.ZodType<PortalBody>

export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { sessionOnly: true })
  const { returnUrl } = await readValidatedBody(event, bodySchema.parse)
  const origin = getRequestURL(event).origin

  let returnTo = `${origin}${useRuntimeConfig().public.subscriptions?.pages?.membership ?? '/'}`
  if (returnUrl) {
    const safe = resolveSameOriginUrl(returnUrl, origin)
    if (!safe) throw createError({ statusCode: 400, statusMessage: 'returnUrl must be on the same origin.' })
    returnTo = safe
  }

  const customer = await ensureStripeCustomer(user.id)
  const session = await useStripe().billingPortal.sessions.create({ customer, return_url: returnTo })
  return { url: session.url }
})
