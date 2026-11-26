import { db, schema } from '@nuxthub/db'
import { lt } from 'drizzle-orm'

/**
 * Deletes the click rows older than `shortLinks.retention.days` (nothing when it is `false`). Resolves with how many
 * rows were deleted. The `clicks` counter and `lastClickedAt` of the links are kept.
 */
export async function shortLinksRunRetention(options: { now?: Date } = {}): Promise<{ deleted: number }> {
  const days = (useRuntimeConfig().shortLinks as { retention?: { days?: number | false } } | undefined)?.retention?.days ?? 365
  if (days === false || !Number.isFinite(days) || days <= 0) return { deleted: 0 }
  const cutoff = new Date((options.now ?? new Date()).getTime() - days * 86_400_000)
  const rows = await db.delete(schema.shortLinkClicks)
    .where(lt(schema.shortLinkClicks.at, cutoff))
    .returning({ id: schema.shortLinkClicks.id })
  return { deleted: rows.length }
}
