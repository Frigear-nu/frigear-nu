// Framework free: the provider senders only need `jose` and a `fetch`, so they run on Node and on Workers.

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
 * `failed` (anything else: a provider outage, bad credentials, a rejected payload; the token stays).
 */
export type DeliveryOutcome = { status: 'sent' } | { status: 'dead' | 'failed', reason: string }

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type ProviderEnvironment = {
  /** Defaults to the global `fetch`, read at call time. */
  fetch?: FetchLike
  /** Milliseconds since the epoch. Defaults to `Date.now`. */
  now?: () => number
}

export type DeviceSender = {
  send: (message: DeviceMessage) => Promise<DeliveryOutcome>
}

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
