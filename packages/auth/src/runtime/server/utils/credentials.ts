import type { H3Event } from 'h3'

/**
 * Why a user's credentials changed: a password change, a password reset (by email), a new (or restored) email, or an
 * unverified account's credentials cleared when its address was first verified another way (`unverified-account`).
 */
export type AuthCredentialsChangeReason = 'password' | 'password-reset' | 'email' | 'unverified-account'

/** `auth:credentials:changed`: a user's password or email changed. Listeners end what the old credentials signed in. */
export type AuthCredentialsChangedContext = {
  userId: number | string
  reason: AuthCredentialsChangeReason
  event?: H3Event
}

/**
 * Fires `auth:credentials:changed` after a user's password or email changed, so other modules can end sessions the
 * old credentials opened (`@frigear-nu/oauth-server` revokes the user's OAuth sign-ins). Call it after the change is
 * stored. A failing listener is logged, never thrown: the change already happened.
 */
export async function notifyAuthCredentialsChanged(context: AuthCredentialsChangedContext): Promise<void> {
  try {
    await useNitroApp().hooks.callHook('auth:credentials:changed', context)
  }
  catch (error) {
    console.error(`[@frigear-nu/auth] A listener of auth:credentials:changed failed (user ${context.userId}, ${context.reason}).`, error)
  }
}
