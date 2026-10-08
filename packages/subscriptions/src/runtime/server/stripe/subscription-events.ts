import { db, schema } from '@nuxthub/db'
import { defineStripeEventHandler } from '@frigear-nu/stripe/utils'
import { resolvePlanKey } from '../../utils/plans'

type SubscriptionEventType
  = | 'customer.subscription.created'
    | 'customer.subscription.updated'
    | 'customer.subscription.deleted'
    | 'customer.subscription.paused'
    | 'customer.subscription.resumed'

const toDate = (seconds: number | null | undefined) => (typeof seconds === 'number' ? new Date(seconds * 1000) : null)

// Idempotent upsert keyed by the Stripe subscription id. Rows are never deleted: a deleted/ended
// subscription only gets `endedAt`. Prices outside every configured plan are stored with `planKey = null`.
export default defineStripeEventHandler<SubscriptionEventType>(async (event, ctx) => {
  const subscription = event.data.object

  if (ctx.userId === null) {
    console.warn(`[@frigear-nu/subscriptions] Ignoring ${event.type} (${event.id}): no local user is linked to the Stripe customer.`)
    return
  }

  const items = subscription.items?.data ?? []
  const first = items[0]
  const priceId = first?.price?.id ?? ''
  const plans = useRuntimeConfig().subscriptions?.plans ?? {}
  const planKey = first?.price
    ? resolvePlanKey(plans, { id: first.price.id, lookupKey: first.price.lookup_key })
    : null

  const starts = items.map(item => item.current_period_start).filter((v): v is number => typeof v === 'number')
  const ends = items.map(item => item.current_period_end).filter((v): v is number => typeof v === 'number')

  const endedAt = toDate(subscription.ended_at)
    ?? (event.type === 'customer.subscription.deleted' ? toDate(subscription.canceled_at) ?? new Date() : null)

  const values = {
    userId: ctx.userId,
    planKey,
    priceId,
    status: event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    currentPeriodStart: starts.length ? toDate(Math.min(...starts)) : null,
    currentPeriodEnd: ends.length ? toDate(Math.max(...ends)) : null,
    endedAt,
    rawItems: items.map(item => ({
      id: item.id,
      priceId: item.price.id,
      lookupKey: item.price.lookup_key ?? null,
      quantity: item.quantity ?? null,
    })),
  }

  await db.insert(schema.subscriptions)
    .values({ id: subscription.id, ...values })
    .onConflictDoUpdate({ target: schema.subscriptions.id, set: { ...values, updatedAt: new Date() } })
})
