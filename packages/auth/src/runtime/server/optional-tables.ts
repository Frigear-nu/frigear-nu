import { schema } from '@nuxthub/db'

type Schema = typeof schema

/**
 * A table this module registers only when the feature owning it is on (`auth_oauth_tokens` with a provider's
 * `keepTokens`, `auth_frigear_handoffs` with `oauth.frigear.handoff`), or `undefined` when it is off. Read with
 * `Reflect.get`: `schema.<table>` on the `@nuxthub/db` namespace makes Rollup warn that the export is missing in every
 * app without the feature (`"authOAuthTokens" is not exported by "@nuxthub/db/schema.mjs"`).
 * Not under `server/utils`, so it is not a server auto-import of the app.
 */
export function optionalTable<K extends keyof Schema>(name: K): Schema[K] | undefined {
  return Reflect.get(schema, name)
}
