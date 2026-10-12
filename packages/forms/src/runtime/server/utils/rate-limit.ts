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

const attemptKey = (event: H3Event, slug: string) => {
  const { rateLimitWindowSeconds } = useRuntimeConfig().forms
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  return `forms:password:${slug}:${ip}:${Math.floor(Date.now() / (rateLimitWindowSeconds * 1000))}`
}

/** Refuses further password guesses once `rateLimit` wrong ones were made in the window. `rateLimit: 0` disables. */
export async function assertPasswordAttemptsLeft(event: H3Event, slug: string) {
  const { rateLimit, rateLimitWindowSeconds } = useRuntimeConfig().forms
  if (!rateLimit) return
  if (Number(await kv.get<number>(attemptKey(event, slug)) ?? 0) >= rateLimit) {
    setResponseHeader(event, 'retry-after', rateLimitWindowSeconds)
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts, try again later.' })
  }
}

export async function recordPasswordFailure(event: H3Event, slug: string) {
  const { rateLimit, rateLimitWindowSeconds } = useRuntimeConfig().forms
  if (!rateLimit) return
  const key = attemptKey(event, slug)
  await kv.set(key, Number(await kv.get<number>(key) ?? 0) + 1, { ttl: rateLimitWindowSeconds })
}
