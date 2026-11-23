// Framework free: the provider senders only need `jose`, `fetch` and (for APNs) `node:http2`, so they run on Node and
// the FCM side (Android, and iOS devices registered with their FCM token) also on Workers.

/** One push to one device token. */
export type DeviceMessage = {
  token: string
  title: string
  body: string
  url?: string
  data?: Record<string, string>
}

/**
 * What a provider said about one device: `sent` (accepted), `dead` (the token is no longer valid: revoke it) or
 * `failed` (anything else: a provider outage, a timeout, bad credentials, a rejected payload; the token stays;
 * `deviceError` when the provider refused this device's request, see `isDeviceRejection`).
 * A `dead` outcome with `ambiguous` can also mean a wrong environment (APNs `BadDeviceToken` for a sandbox token sent
 * to production), so `deliverToDevices` does not revoke it when every iOS device of a call gets it.
 */
export type DeliveryOutcome = { status: 'sent' } | { status: 'failed', reason: string, deviceError?: boolean } | { status: 'dead', reason: string, ambiguous?: boolean }

/**
 * Whether a provider's HTTP status refuses this one device's push (a 4xx about the request), rather than saying
 * something about the provider or the credentials (401, 403), the payload size (413), the rate (429), a timeout (408)
 * or an outage (5xx). Such failures count toward the device's consecutive failures (`deviceError`), which revoke it
 * after a few in a row.
 */
export function isDeviceRejection(status: number): boolean {
  return status >= 400 && status < 500 && ![401, 403, 408, 413, 429].includes(status)
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** An HTTP/2 request to one origin (`https://api.push.apple.com`). */
export type Http2Request = {
  origin: string
  path: string
  headers: Record<string, string>
  body: string
  timeoutMs: number
}

export type Http2Response = { status: number, body: string }

/** What the APNs sender sends through. Swap it in tests, or for a relay on a runtime without `node:http2`. */
export type Http2Transport = (request: Http2Request) => Promise<Http2Response>

export type ProviderEnvironment = {
  /** Defaults to the global `fetch`, read at call time. */
  fetch?: FetchLike
  /** Transport of the APNs sender. Defaults to `node:http2` (see `http2.ts`). */
  http2?: Http2Transport
  /** Milliseconds since the epoch. Defaults to `Date.now`. */
  now?: () => number
  /** How long a provider request may take before it counts as failed. Defaults to 10 seconds. */
  timeoutMs?: number
  /** Where warnings go. Defaults to `console`. */
  log?: Pick<Console, 'warn'>
}

export type DeviceSender = {
  send: (message: DeviceMessage) => Promise<DeliveryOutcome>
}

export const DEFAULT_TIMEOUT_MS = 10_000

export const callFetch: FetchLike = (input, init) => globalThis.fetch(input, init)

/** Accepts PEMs pasted into env files: strips wrapping quotes and turns literal `\n` into newlines. */
export function normalizePemKey(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').trim()
}

/** A short description of a failed provider response, for logs and `reason`. */
export async function describeResponse(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  return `${response.status}${text ? ` ${text.slice(0, 300)}` : ''}`
}

/** An error message for `reason`, naming a timeout as one. */
export function describeError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return `timed out after ${timeoutMs} ms`
  return error instanceof Error ? error.message : String(error)
}
