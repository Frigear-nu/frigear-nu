import { db, schema } from '@nuxthub/db'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  planKey: z.string().min(1),
  /** Optional end of the free membership (ISO date); the grant is open-ended without it. */
  endsAt: z.string().nullish(),
})

// Staff grants a membership free of charge: a manual row (no Stripe subscription behind it) that counts as an
// active subscription until revoked or its optional end date passes.
export default defineEventHandler(async (event) => {
  const { target } = await loadAdminMembershipTarget(event, 'update')
  const body = await readValidatedBody(event, bodySchema.parse)

  const plans = useRuntimeConfig().subscriptions?.plans ?? {}
  if (Object.keys(plans).length && !plans[body.planKey]) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown plan.' })
  }

  let endsAt: Date | null = null
  if (body.endsAt) {
    endsAt = new Date(body.endsAt)
    if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= Date.now()) {
      throw createError({ statusCode: 400, statusMessage: 'The end date must be in the future.' })
    }
  }

  const rows = await listUserSubscriptionRows(target.id)
  const current = currentEntitledRow(rows)
  if (current && current.source !== 'manual') {
    throw createError({ statusCode: 409, statusMessage: 'The user already has a paid subscription.' })
  }

  // Replace an existing manual grant instead of stacking them.
  const now = new Date()
  await db.update(schema.subscriptions)
    .set({ status: 'canceled', endedAt: now })
    .where(and(eq(schema.subscriptions.userId, target.id), eq(schema.subscriptions.source, 'manual'), isNull(schema.subscriptions.endedAt)))

  const id = `manual_${crypto.randomUUID()}`
  await db.insert(schema.subscriptions).values({
    id,
    userId: target.id,
    planKey: body.planKey,
    priceId: '',
    status: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodStart: now,
    currentPeriodEnd: endsAt,
    endedAt: null,
    source: 'manual',
  })
  return { id, planKey: body.planKey, endsAt: endsAt?.toISOString() ?? null }
})
