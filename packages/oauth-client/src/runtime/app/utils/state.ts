import { useState } from '#imports'
import type { IdTokenClaims } from '../../core/types'
import type { OAuthStatus } from '../../../types'

/** The reactive sign-in state shared by `useOAuth`, the plugin and the middleware. */
export const useOAuthState = () => ({
  /** `unknown` on the server and until the client plugin read the storage. */
  status: useState<OAuthStatus>('oauth-client:status', () => 'unknown'),
  claims: useState<IdTokenClaims | null>('oauth-client:claims', () => null),
  signingIn: useState<boolean>('oauth-client:signing-in', () => false),
})
