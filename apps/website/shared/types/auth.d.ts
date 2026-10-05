import type { Users } from '@nuxthub/db/schema'
import type { ExtendableJwtPayload } from '@nitrotool/jwt/core'

type SessionUser = Pick<Users, 'id' | 'name' | 'email' | 'role' | 'avatarUrl' | 'emailVerifiedAt'>

declare module '#auth-utils' {
  interface User extends SessionUser {
    sbId?: string
  }
  //
  interface UserSession {
    oauthRequest?: {
      clientId: string
      redirectUri: string
      scope: string
      state?: string
      codeChallenge?: string
      codeChallengeMethod?: string
      clientName?: string
      clientLogoUrl?: string
      clientHost?: string
      nonce?: string
    }
  }
  // interface SecureSessionData {
  //   // Add your own fields
  // }
}
//
declare module 'h3' {
  interface H3EventContext {
    $user?: SessionUser
    $jwt?: ExtendableJwtPayload
  }
}

export {}
