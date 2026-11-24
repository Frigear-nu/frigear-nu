import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

// The language a user saved at frigear.nu (its `locale` claim) becomes their `users.locale` here at every frigear.nu
// login (`auth:frigear:login` of `@frigear-nu/auth`), when it is one the app accepts (`parseUserLocale`). The session
// starts with the stored value, so the client sees the same language the login applies.

/** What this plugin reads and writes of auth's `auth:frigear:login` context (its `FrigearLoginContext`). */
export interface UsersFrigearLoginContext {
  user: { id: number, locale?: unknown } & Record<string, unknown>
  claims: Record<string, unknown>
}

/** Stores the claimed language on the user when it is valid and differs, and hands the updated user back. */
export async function storeFrigearLocaleClaim(ctx: UsersFrigearLoginContext) {
  const locale = parseUserLocale(ctx.claims.locale)
  if (!locale || ctx.user.locale === locale) return
  await db.update(schema.users).set({ locale, updatedAt: new Date() }).where(eq(schema.users.id, Number(ctx.user.id)))
  ctx.user = { ...ctx.user, locale }
}

export default defineNitroPlugin((nitro) => {
  const hooks = nitro.hooks as unknown as { hook: (name: 'auth:frigear:login', handler: (ctx: UsersFrigearLoginContext) => Promise<void>) => void }
  hooks.hook('auth:frigear:login', storeFrigearLocaleClaim)
})
