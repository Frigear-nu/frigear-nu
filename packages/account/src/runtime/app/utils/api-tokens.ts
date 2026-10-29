// Shapes of the API token routes of @frigear-nu/auth, as the account pages use them.

import type { AuthCreatedTokenDto, AuthTokenDto } from '@frigear-nu/auth/utils'

export type ApiToken = AuthTokenDto

export interface ApiTokenScope { name: string, description?: string }

/** The response to creating a token: the only time its plaintext `token` exists. */
export type CreatedApiToken = AuthCreatedTokenDto
