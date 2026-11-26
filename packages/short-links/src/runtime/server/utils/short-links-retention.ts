import { db, schema } from '@nuxthub/db'
import { and, eq, lte, or } from 'drizzle-orm'
import type { ShortLinksRuntimeConfig } from '../../../types'

const DAY = 86_400_000

/**
 * Deletes the click rows older than `shortLinks.retention.days` (none when it is `false`; the `clicks` counter and
 * `lastClickedAt` of the links stay), and the links with `autoDelete` that expired or were disabled more than
 * `retention.deleteAfterDays` ago, with their click rows. Resolves with how many of each were deleted.
 */
export async function shortLinksRunRetention(options: { now?: Date } = {}): Promise<{ clicks: number, links: number }> {
  const retention = (useRuntimeConfig().shortLinks as Partial<ShortLinksRuntimeConfig> | undefined)?.retention
  const now = (options.now ?? new Date()).getTime()
  const t = schema.shortLinks

  let links = 0
  const grace = retention?.deleteAfterDays ?? 30
  if (Number.isFinite(grace) && grace >= 0) {
    const cutoff = new Date(now - grace * DAY)
    links = await deleteLinksWhere(and(eq(t.autoDelete, true), or(lte(t.expiresAt, cutoff), lte(t.disabledAt, cutoff)))!)
  }

  let clicks = 0
  const days = retention?.days ?? 365
  if (days !== false && Number.isFinite(days) && days > 0) {
    const rows = await db.delete(schema.shortLinkClicks)
      .where(lte(schema.shortLinkClicks.at, new Date(now - days * DAY)))
      .returning({ id: schema.shortLinkClicks.id })
    clicks = rows.length
  }
  return { clicks, links }
}
