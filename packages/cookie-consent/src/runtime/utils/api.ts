// Typed paths of the module's HTTP routes, for app code, tests and docs (no string literals elsewhere).

/** The cookie-consent API (registered only while consent is persisted on the user). */
export const cookieConsentApi = {
  /**
   * Session only. `GET`: `{ consent }`, the signed-in user's stored choice (`null` before they answered).
   * `POST { categories, version }`: stores the choice and answers the same `{ consent }` shape (200).
   */
  root: '/api/cookie-consent',
} as const
