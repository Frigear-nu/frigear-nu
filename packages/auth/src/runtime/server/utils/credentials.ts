import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, eq, isNull } from 'drizzle-orm'

/**
 * Why a user's credentials changed: a password change, a password reset (by email), a new email, an email change
 * undone from the old address (`email-revert`), or an unverified account's credentials cleared when its address was
 * first verified another way (`unverified-account`).
 */
export type AuthCredentialsChangeReason = 'password' | 'password-reset' | 'email' | 'email-revert' | 'unverified-account'

/** `auth:credentials:changed`: a user's password or email changed. Listeners end what the old credentials signed in. */
export type AuthCredentialsChangedContext = {
  userId: number | string
  reason: AuthCredentialsChangeReason
  event?: H3Event
}

// Recovery from a lost or taken account: whoever had it may have minted API tokens to keep access.
const TOKEN_REVOKING_REASONS: AuthCredentialsChangeReason[] = ['password-reset', 'email-revert']

/**
 * Fires `auth:credentials:changed` after a user's password or email changed, so other modules can end sessions the
 * old credentials opened (`@frigear-nu/oauth-server` revokes the user's OAuth sign-ins). Call it after the change is
 * stored. First it ends the user's other cookie sessions (`endAuthSessions`; the session of `event` stays signed in)
 * and, for a password reset or a reverted email change, revokes their API tokens (`apiTokens.revokeOnReset`). A
 * failing step or listener is logged, never thrown: the change already happened.
 */
export async function notifyAuthCredentialsChanged(context: AuthCredentialsChangedContext): Promise<void> {
  const { userId, reason, event } = context
  try {
    await endAuthSessions(userId, event)
  }
  catch (error) {
    console.error(`[@frigear-nu/auth] Could not end the sessions of user ${userId} (${reason}).`, error)
  }
  if (TOKEN_REVOKING_REASONS.includes(reason) && useRuntimeConfig(event).authentication?.revokeTokensOnReset !== false) {
    await revokeAuthUserTokens(userId)
      .catch(error => console.error(`[@frigear-nu/auth] Could not revoke the API tokens of user ${userId} (${reason}).`, error))
  }
  try {
    await useNitroApp().hooks.callHook('auth:credentials:changed', context)
  }
  catch (error) {
    console.error(`[@frigear-nu/auth] A listener of auth:credentials:changed failed (user ${userId}, ${reason}).`, error)
  }
}

/** Revokes every live API token of the user. The rows are kept for the audit trail, like a revoke from the account page. */
export async function revokeAuthUserTokens(userId: number | string) {
  await db.update(schema.authUserTokens).set({ revokedAt: new Date() })
    .where(and(eq(schema.authUserTokens.userId, String(userId)), isNull(schema.authUserTokens.revokedAt)))
}
