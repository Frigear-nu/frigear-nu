import type { H3Event } from 'h3'
import { kv } from '@nuxthub/kv'

/**
 * Fixed-window counter per client and form, kept in KV. Not exact under concurrency (read then
 * write), which is fine for throttling casual abuse. `rateLimit: 0` disables it.
 */
export async function enforceRateLimit(event: H3Event, slug: string) {
  const { rateLimit, rateLimitWindowSeconds } = useRuntimeConfig().forms
  if (!rateLimit) return

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const window = Math.floor(Date.now() / (rateLimitWindowSeconds * 1000))
  const key = `forms:rate:${slug}:${ip}:${window}`
  const used = Number(await kv.get<number>(key) ?? 0)
  if (used >= rateLimit) {
    setResponseHeader(event, 'retry-after', rateLimitWindowSeconds)
    throw createError({ statusCode: 429, statusMessage: 'Too many submissions, try again later.' })
  }
  await kv.set(key, used + 1, { ttl: rateLimitWindowSeconds })
}
