import type { H3Event } from 'h3'
import { apiError } from '@frigear-nu/module-kit/server'
import { kv } from '#auth/rate-limit-kv'

/** The anonymous auth routes counted per client IP (`rateLimit.requests`). */
export type AuthRateLimitRoute = 'register' | 'forgot-password' | 'magic-link' | 'webauthn'

type RateLimitConfig = {
  enabled: boolean
  windowSeconds: number
  login: number
  loginIp: number
  requests: number
  ipHeader: string
  xForwardedFor: boolean
}

function rateLimitConfig(event: H3Event): RateLimitConfig | undefined {
  const config = useRuntimeConfig(event).authentication?.rateLimit as RateLimitConfig | undefined
  return config?.enabled && kv ? config : undefined
}

/**
 * The client the limits count against: the platform's client IP header (`rateLimit.ipHeader`; `cf-connecting-ip` on
 * Cloudflare), else the socket address. `X-Forwarded-For` is only read with `rateLimit.xForwardedFor`, since any client
 * can send it.
 */
export function authClientIp(event: H3Event): string {
  const config = rateLimitConfig(event)
  const header = config?.ipHeader || (String(import.meta.preset ?? '').startsWith('cloudflare') ? 'cf-connecting-ip' : '')
  const fromHeader = header ? getRequestHeader(event, header)?.split(',')[0]?.trim() : undefined
  return fromHeader || getRequestIP(event, { xForwardedFor: config?.xForwardedFor === true }) || 'unknown'
}

async function hashKey(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].slice(0, 16).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** A fixed window: the counter key for the current window and the seconds until it ends. */
function windowOf(config: RateLimitConfig) {
  const now = Date.now() / 1000
  return { index: Math.floor(now / config.windowSeconds), retryAfter: Math.max(1, Math.ceil(config.windowSeconds - (now % config.windowSeconds))) }
}

const tooMany = (event: H3Event, retryAfter: number) => {
  setResponseHeader(event, 'retry-after', retryAfter)
  return apiError(429, 'rate_limited', 'Too many attempts. Try again later.')
}

// A KV outage must not lock everyone out: the limits are skipped while it fails.
async function read(key: string) {
  try {
    return Number(await kv!.get<number>(key) ?? 0)
  }
  catch (error) {
    console.error('[@frigear-nu/auth] rate limit store failed:', error)
    return 0
  }
}

async function increment(key: string, ttl: number) {
  try {
    await kv!.set(key, Number(await kv!.get<number>(key) ?? 0) + 1, { ttl })
  }
  catch (error) {
    console.error('[@frigear-nu/auth] rate limit store failed:', error)
  }
}

/**
 * Counts a request to an anonymous auth route per client IP and refuses it with `429` (and `retry-after`) past
 * `rateLimit.requests` in the window. Not exact under concurrency (read, then write), which is fine for throttling.
 */
export async function enforceAuthRateLimit(event: H3Event, route: AuthRateLimitRoute) {
  const config = rateLimitConfig(event)
  if (!config?.requests) return
  const { index, retryAfter } = windowOf(config)
  const key = `auth:rate:${route}:${await hashKey(authClientIp(event))}:${index}`
  if (await read(key) >= config.requests) throw tooMany(event, retryAfter)
  await increment(key, config.windowSeconds)
}

async function loginKeys(event: H3Event, config: RateLimitConfig, email: string) {
  const ip = authClientIp(event)
  const { index } = windowOf(config)
  return {
    account: `auth:rate:login:${await hashKey(`${ip}\n${email.trim().toLowerCase()}`)}:${index}`,
    ip: `auth:rate:login-ip:${await hashKey(ip)}:${index}`,
  }
}

/**
 * Refuses a password sign-in with `429` once this client made `rateLimit.login` failed attempts for the account, or
 * `rateLimit.loginIp` for any account, in the window. Only failures count (`recordAuthLoginFailure`).
 */
export async function assertAuthLoginAttemptsLeft(event: H3Event, email: string) {
  const config = rateLimitConfig(event)
  if (!config || (!config.login && !config.loginIp)) return
  const keys = await loginKeys(event, config, email)
  const { retryAfter } = windowOf(config)
  if (config.login && await read(keys.account) >= config.login) throw tooMany(event, retryAfter)
  if (config.loginIp && await read(keys.ip) >= config.loginIp) throw tooMany(event, retryAfter)
}

/** Counts a failed password sign-in for this client and account (`assertAuthLoginAttemptsLeft`). */
export async function recordAuthLoginFailure(event: H3Event, email: string) {
  const config = rateLimitConfig(event)
  if (!config || (!config.login && !config.loginIp)) return
  const keys = await loginKeys(event, config, email)
  if (config.login) await increment(keys.account, config.windowSeconds)
  if (config.loginIp) await increment(keys.ip, config.windowSeconds)
}
