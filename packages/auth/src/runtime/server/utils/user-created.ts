import type { H3Event } from 'h3'
import type { AuthStoredUser } from '../../types'

/**
 * How an account was made: the registration form (`password`), an emailed sign-up link (`magic-link`), a first sign-in
 * with an OAuth provider (`oauth`) or with frigear.nu (`frigear`, also an account an OAuth resource server provisions),
 * a passkey sign-up (`passkey`), or staff creating it (`admin`, `@frigear-nu/users`).
 */
export type AuthUserCreatedSource = 'password' | 'magic-link' | 'oauth' | 'frigear' | 'passkey' | 'admin'

/** `auth:user:created`: an account was just created. */
export type AuthUserCreatedContext = {
  /** The request that created it; missing when there is none (an account provisioned outside a request). */
  event?: H3Event
  /** The stored user. Its `emailVerifiedAt` says whether the address is proven yet. */
  user: AuthStoredUser
  source: AuthUserCreatedSource
  /** The OAuth provider, for `source: 'oauth'`. */
  provider?: string
  /**
   * What the widgets of the registration form (`auth.register`) sent with it, keyed by module name
   * (`{ campaigns: { listIds: [...] } }`). Only for `source: 'password'`; auth checks its size, never its contents, so
   * a listener validates its own entry.
   */
  extras?: Record<string, unknown>
}

/**
 * Fires `auth:user:created` once an account exists, so other modules can set up what they keep for new users. Call it
 * after the user is stored (and after anything that may still undo the creation). A failing listener is logged, never
 * thrown: the account exists already, and signing up must not fail because of another module.
 */
export async function notifyAuthUserCreated(context: AuthUserCreatedContext): Promise<void> {
  try {
    await useNitroApp().hooks.callHook('auth:user:created', context)
  }
  catch (error) {
    console.error(`[@frigear-nu/auth] A listener of auth:user:created failed (user ${context.user.id}, ${context.source}).`, error)
  }
}
