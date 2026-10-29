import { z } from 'zod'
import { resolveSameOriginUrl } from '@frigear-nu/module-kit/server'
import type { PortalBody } from '../../../../types'

const bodySchema = z.object({ returnUrl: z.string().optional() }) satisfies z.ZodType<PortalBody>

// Opens the Stripe billing portal for the caller. Billing: a session is required, a bearer token is refused.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { sessionOnly: true })
  const { returnUrl } = await readValidatedBody(event, bodySchema.parse)
  const returnTo = resolveSameOriginUrl(event, returnUrl, {
    fallback: useRuntimeConfig().public.subscriptions?.pages?.membership ?? '/',
    name: 'returnUrl',
  })

  const customer = await ensureStripeCustomer(user.id)
  const session = await useStripe().billingPortal.sessions.create({ customer, return_url: returnTo })
  return { url: session.url }
})
