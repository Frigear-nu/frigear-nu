// Shapes of the API token routes of @frigear-nu/auth, as the account pages use them.

export interface ApiToken {
  id: string
  name: string
  prefix: string
  last4: string
  scopes: string[]
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  status: 'ok' | 'revoked' | 'expired'
}

export interface ApiTokenScope { name: string, description?: string }

/** The response to creating a token: the only time its plaintext `token` exists. */
export type CreatedApiToken = ApiToken & { token: string }
