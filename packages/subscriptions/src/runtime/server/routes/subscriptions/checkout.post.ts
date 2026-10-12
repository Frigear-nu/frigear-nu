import { db, schema } from '@nuxthub/db'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { CheckoutBeforeContext, CheckoutBody, CheckoutResponse } from '../../../../types'
import { LIVE_STATUSES, decideChangeKind, resolveSameOriginUrl } from '../../../utils/plans'

const bodySchema = z.object({
  planKey: z.string().min(1).optional(),
  priceId: z.string().min(1).optional(),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
}).refine(body => body.planKey || body.priceId, { message: 'Provide `planKey` or `priceId`.' }) satisfies z.ZodType<CheckoutBody>

export default defineEventHandler(async (event): Promise<CheckoutResponse> => {
  const user = await requireUser(event, { scopes: ['subscriptions:write'] })
  const body = await readValidatedBody(event, bodySchema.parse)
  const origin = getRequestURL(event).origin
  const config = useRuntimeConfig()
  const pages = config.public.subscriptions?.pages ?? {}
  const configuredPlans = config.subscriptions?.plans ?? {}
  const stripe = useStripe()

  const safeUrl = (input: string | undefined, fallbackPath: string | undefined, name: string) => {
    if (input) {
      const safe = resolveSameOriginUrl(input, origin)
      if (!safe) throw createError({ statusCode: 400, statusMessage: `${name} must be a relative path or an URL on the same origin.` })
      return safe
    }
    return `${origin}${fallbackPath ?? pages.membership ?? '/'}`
  }
  const successUrl = safeUrl(body.successUrl, pages.success, 'successUrl')
  const cancelUrl = safeUrl(body.cancelUrl, pages.cancel, 'cancelUrl')

  // --- Resolve the target price / plan --------------------------------------------------
  const { priceId, planKey } = await resolveCheckoutTarget(stripe, await getAvailablePlans(event), body)

  // --- New checkout or change of an existing subscription ---------------------------------
  const rows = await db.select().from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, user.id))
    .orderBy(desc(schema.subscriptions.createdAt))
  const existing = rows.find(row => row.source !== 'manual' && LIVE_STATUSES.includes(row.status) && !row.endedAt)

  // A subscription that is set to end can be resumed by picking its own price again.
  if (existing?.priceId === priceId && existing.cancelAtPeriodEnd) {
    await resumeSubscription(stripe, existing.id)
    return { updated: true, kind: 'resume' }
  }

  if (existing?.priceId === priceId) {
    throw createError({ statusCode: 409, statusMessage: 'You are already subscribed to this price.' })
  }

  const kind: CheckoutBeforeContext['kind'] = existing
    ? decideChangeKind(existing.planKey ? configuredPlans[existing.planKey]?.rank : null, planKey ? configuredPlans[planKey]!.rank : Number.POSITIVE_INFINITY)
    : 'checkout'

  const hookContext: CheckoutBeforeContext = {
    event,
    userId: user.id,
    planKey,
    priceId,
    kind,
    params: {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: String(user.id),
      subscription_data: { metadata: { userId: String(user.id), ...(planKey ? { planKey } : {}) } },
    },
  }
  await useNitroApp().hooks.callHook('subscriptions:checkout:before', hookContext)

  if (existing) {
    const change = hookContext.kind as 'upgrade' | 'downgrade'
    // A subscription that is set to end is switched immediately, which also keeps it from ending.
    if (change === 'upgrade' || existing.cancelAtPeriodEnd) {
      await upgradeSubscription(stripe, existing.id, priceId)
    }
    else {
      await scheduleDowngrade(stripe, existing.id, priceId)
    }
    return { updated: true, kind: change }
  }

  const customer = await ensureStripeCustomer(user.id)
  const session = await stripe.checkout.sessions.create({ ...hookContext.params, customer })
  if (!session.url) throw createError({ statusCode: 502, statusMessage: 'Stripe did not return a checkout URL.' })
  return { url: session.url }
})

type StripeClient = ReturnType<typeof useStripe>

/** Undoes a pending cancellation (and a pending downgrade schedule) so the subscription keeps renewing. */
async function resumeSubscription(stripe: StripeClient, subscriptionId: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const scheduleId = typeof subscription.schedule === 'string' ? subscription.schedule : subscription.schedule?.id
  if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId)
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false })
}

/** Immediate switch, invoicing the prorated difference right away; clears a pending downgrade schedule first. */
async function upgradeSubscription(stripe: StripeClient, subscriptionId: string, priceId: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const item = subscription.items.data[0]
  if (!item) throw createError({ statusCode: 409, statusMessage: 'The subscription has no items to change.' })

  const scheduleId = typeof subscription.schedule === 'string' ? subscription.schedule : subscription.schedule?.id
  if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId)

  await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: item.id, price: priceId }],
    proration_behavior: 'always_invoice',
    cancel_at_period_end: false,
  })
}

/** Keeps the current price until the period ends, then switches (via a subscription schedule). */
async function scheduleDowngrade(stripe: StripeClient, subscriptionId: string, priceId: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const item = subscription.items.data[0]
  if (!item) throw createError({ statusCode: 409, statusMessage: 'The subscription has no items to change.' })

  const scheduleId = typeof subscription.schedule === 'string' ? subscription.schedule : subscription.schedule?.id
  const schedule = scheduleId
    ? await stripe.subscriptionSchedules.retrieve(scheduleId)
    : await stripe.subscriptionSchedules.create({ from_subscription: subscriptionId })

  const current = schedule.phases[0]
  if (!current) throw createError({ statusCode: 409, statusMessage: 'Could not read the current billing phase.' })

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: 'release',
    phases: [
      {
        items: [{ price: item.price.id, quantity: item.quantity ?? 1 }],
        start_date: current.start_date,
        end_date: current.end_date,
      },
      {
        items: [{ price: priceId, quantity: item.quantity ?? 1 }],
        iterations: 1,
      },
    ],
  })
}
