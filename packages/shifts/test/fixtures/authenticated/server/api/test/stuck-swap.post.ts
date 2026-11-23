import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'

// Test-only: leaves a swap as a process that died halfway through an exchange would: `accepted`, the accepted offer
// standing, the owner's assignment already handed to the offerer (unless `moved: false`), and its `updatedAt` in the
// past so the owner may recover it.
export default defineEventHandler(async (event) => {
  const { swapId, offerId, moved = true } = await readBody<{ swapId: string, offerId: string, moved?: boolean }>(event)
  const [swap] = await db.select().from(schema.shiftSwaps).where(eq(schema.shiftSwaps.id, swapId)).limit(1)
  const [offer] = await db.select().from(schema.shiftSwapOffers).where(eq(schema.shiftSwapOffers.id, offerId)).limit(1)
  if (!swap || !offer) throw createError({ statusCode: 404 })
  await db.update(schema.shiftSwapOffers).set({ status: 'accepted' }).where(eq(schema.shiftSwapOffers.id, offerId))
  if (moved) {
    await db.update(schema.shiftAssignments).set({ userId: offer.userId })
      .where(and(eq(schema.shiftAssignments.id, swap.assignmentId), eq(schema.shiftAssignments.userId, swap.userId)))
  }
  await db.update(schema.shiftSwaps).set({ status: 'accepted', updatedAt: new Date(Date.now() - 10 * 60_000) }).where(eq(schema.shiftSwaps.id, swapId))
  return { ok: true }
})
