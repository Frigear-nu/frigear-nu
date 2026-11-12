import { db, schema } from '@nuxthub/db'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { badRequest, conflict, created } from '@frigear-nu/module-kit/server'
import type { SubscriptionDto } from '../../../../types'

const bodySchema = z.object({
  planKey: z.string().min(1),
  /** Optional end of the free membership (ISO date, in the future); the grant is open-ended without it. */
  endsAt: z.coerce.date().refine(date => date.getTime() > Date.now(), 'The end date must be in the future.').nullish(),
})

// Staff grants a membership free of charge: a manual row (no Stripe subscription behind it) that counts as an
// active subscription until revoked or its optional end date passes. Answers 201 with the new membership. Refused
// (403 `forbidden`) for oneself, and when a role the plan satisfies (`requirements.subscription`) holds a permission the
// staff member lacks.
export default defineEventHandler(async (event): Promise<SubscriptionDto> => {
  const { actor, target } = await loadUsersAdminTarget(event, 'update', { permission: 'subscriptions:manage' })
  const body = await readValidatedBody(event, bodySchema.parse)

  const plans = useRuntimeConfig().subscriptions?.plans ?? {}
  if (Object.keys(plans).length && !plans[body.planKey]) {
    throw badRequest('Unknown plan.')
  }
  // Never to oneself, and never a plan whose roles hold more than the staff member does (403 `forbidden`).
  await assertSubscriptionsGrantAllowed(event, actor, target.id, body.planKey)

  const endsAt = body.endsAt ?? null

  const rows = await listUserSubscriptionRows(target.id)
  const current = currentEntitledRow(rows)
  if (current && current.source !== 'manual') {
    throw conflict('The user already has a paid subscription.')
  }

  // Replace an existing manual grant instead of stacking them.
  const now = new Date()
  await db.update(schema.subscriptions)
    .set({ status: 'canceled', endedAt: now })
    .where(and(eq(schema.subscriptions.userId, target.id), eq(schema.subscriptions.source, 'manual'), isNull(schema.subscriptions.endedAt)))

  const id = `manual_${crypto.randomUUID()}`
  const [row] = await db.insert(schema.subscriptions).values({
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
  }).returning()
  return created(event, toSubscriptionDto(row!))
})
