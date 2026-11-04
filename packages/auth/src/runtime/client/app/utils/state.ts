import { useState } from '#imports'
import type { UserSession } from '#auth-utils'
import type { IdTokenClaims } from '../../core/types'
import type { AuthStatus } from '../../types'

/** The reactive sign-in state shared by `useAuth`, `useUserSession` and the plugins. */
export const useAuthClientState = () => ({
  /** `unknown` on the server and until the client plugin read the storage. */
  status: useState<AuthStatus>('auth-client:status', () => 'unknown'),
  claims: useState<IdTokenClaims | null>('auth-client:claims', () => null),
  /** `{ id, user }` while signed in: what `useUserSession().session` returns. */
  session: useState<UserSession | null>('auth-client:session', () => null),
  signingIn: useState<boolean>('auth-client:signing-in', () => false),
})
