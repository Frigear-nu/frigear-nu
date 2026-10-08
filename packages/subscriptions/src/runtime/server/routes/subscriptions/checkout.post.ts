import { db, schema } from '@nuxthub/db'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { CheckoutBeforeContext, CheckoutBody, CheckoutResponse } from '../../../../types'
import { LIVE_STATUSES, decideChangeKind, findPrice, resolveSameOriginUrl } from '../../../utils/plans'

const bodySchema = z.object({
  planKey: z.string().min(1).optional(),
  priceId: z.string().min(1).optional(),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
}).refine(body => body.planKey || body.priceId, { message: 'Provide `planKey` or `priceId`.' }) satisfies z.ZodType<CheckoutBody>

export default defineEventHandler(async (event): Promise<CheckoutResponse> => {
  const { user } = await requireUserSession(event)
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
  let priceId: string
  let planKey: string | null
  if (Object.keys(configuredPlans).length === 0) {
    // "Any subscription" mode: no plans configured, so any recurring price may be used.
    if (!body.priceId) throw createError({ statusCode: 400, statusMessage: '`priceId` is required when no plans are configured.' })
    const price = await stripe.prices.retrieve(body.priceId).catch(() => null)
    if (!price?.recurring || !price.active) throw createError({ statusCode: 400, statusMessage: 'Unknown or non-recurring price.' })
    priceId = price.id
    planKey = null
  }
  else {
    const plans = await getAvailablePlans(event)
    if (body.planKey) {
      const plan = plans.find(item => item.key === body.planKey)
      if (!plan) throw createError({ statusCode: 400, statusMessage: 'Unknown or unavailable plan.' })
      const price = body.priceId
        ? plan.prices.find(item => item.id === body.priceId)
        : plan.prices.length === 1 ? plan.prices[0] : undefined
      if (!price) {
        throw createError({ statusCode: 400, statusMessage: body.priceId ? 'That price does not belong to the plan.' : 'This plan has several prices; provide `priceId`.' })
      }
      priceId = price.id
      planKey = plan.key
    }
    else {
      const found = findPrice(plans, body.priceId!)
      if (!found) throw createError({ statusCode: 400, statusMessage: 'Unknown or unavailable price.' })
      priceId = found.price.id
      planKey = found.plan.key
    }
  }

  // --- New checkout or change of an existing subscription ---------------------------------
  const rows = await db.select().from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, user.id))
    .orderBy(desc(schema.subscriptions.createdAt))
  const existing = rows.find(row => LIVE_STATUSES.includes(row.status) && !row.endedAt)

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
    if (change === 'upgrade') {
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
