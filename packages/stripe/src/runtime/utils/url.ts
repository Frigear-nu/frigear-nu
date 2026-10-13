/**
 * Validates a redirect URL supplied by a client (a Stripe return URL): it must be a relative path (`/x`) or an absolute
 * URL on `origin`. Returns an absolute URL on that origin, or `null` when it is unsafe. Shared by every module that
 * sends people through Stripe so the open-redirect guard exists once.
 */
export function resolveSameOriginUrl(input: string, origin: string): string | null {
  if (input.startsWith('/')) {
    // `//host` and `/\host` are protocol-relative / browser-normalised to another host.
    if (input.startsWith('//') || input.startsWith('/\\')) return null
    return `${origin}${input}`
  }
  try {
    return new URL(input).origin === new URL(origin).origin ? input : null
  }
  catch {
    return null
  }
}
