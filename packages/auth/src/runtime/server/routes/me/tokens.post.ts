import { db, schema } from '@nuxthub/db'
import { apiError, created } from '@frigear-nu/module-kit/server'
import type { AuthCreatedTokenDto } from '../../../../types'
import { isGrantableScope } from '../../../utils/scopes'
import { generateUserToken } from '../../../utils/tokens'
import { scopes as registeredScopes } from '#auth/scopes'

// `POST /api/auth/me/tokens` (session only): creates an API token. 201 with the token, the only time its plaintext exists.
export default defineEventHandler(async (event): Promise<AuthCreatedTokenDto> => {
  const { user } = await requireAuth(event, { sessionOnly: true })
  const body = await readValidatedBody(event, createTokenSchema.parse)

  const registered = registeredScopes.map(scope => scope.name)
  const unknown = body.scopes.filter(scope => !isGrantableScope(scope, registered))
  if (unknown.length) {
    throw apiError(400, 'unknown_scope', `Unknown scopes: ${unknown.join(', ')}`, { scopes: unknown })
  }
  // A token never gets more than its user may do: only the scopes offered to them (`availableScopes`).
  const offered = (await availableScopes(event, user as { id: number, role?: string })).map(scope => scope.name)
  const refused = body.scopes.filter(scope => !isGrantableScope(scope, offered))
  if (refused.length) {
    throw apiError(403, 'insufficient_permission', `You do not hold these permissions: ${refused.join(', ')}`, { scopes: refused })
  }

  const config = useRuntimeConfig(event).authentication
  const days = body.expiresInDays === undefined ? config?.tokenTtlDays : body.expiresInDays
  const { token, tokenHash, prefix, last4 } = await generateUserToken(config?.apiTokenPrefix)
  const [row] = await db.insert(schema.authUserTokens).values({
    id: newTokenId(),
    userId: String(user.id),
    name: body.name,
    tokenHash,
    prefix,
    last4,
    scopes: [...new Set(body.scopes)],
    expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
  }).returning()

  // The plaintext token is returned this once; only its hash is stored.
  return created(event, { ...toAuthTokenDto(row!), token })
})
