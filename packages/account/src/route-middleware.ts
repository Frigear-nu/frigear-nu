/** What a route rule's `appMiddleware` may hold: a name, a list of names, or names mapped to on/off. */
export type AppMiddlewareRule = string | string[] | Record<string, boolean> | undefined

/**
 * Add a route middleware to a rule's `appMiddleware`, keeping the host's entries (an explicit `false` included).
 * The value may be in any form Nuxt accepts, so it is normalised to the object form first: spreading an array or a
 * string would turn it into `{ 0: 'auth' }`, and Nuxt then fails on the unknown middleware `'0'`.
 */
export function withAppMiddleware(existing: AppMiddlewareRule, name: string): Record<string, boolean> {
  const entries = typeof existing === 'string'
    ? { [existing]: true }
    : Array.isArray(existing)
      ? Object.fromEntries(existing.map(middleware => [middleware, true]))
      : existing
  return { [name]: true, ...entries }
}
