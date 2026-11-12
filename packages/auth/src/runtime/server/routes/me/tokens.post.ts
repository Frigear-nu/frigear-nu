import { db, schema } from '@nuxthub/db'
import { apiError, created } from '@frigear-nu/module-kit/server'
import type { AuthCreatedTokenDto } from '../../../../types'
import { isKnownScope } from '../../../utils/permissions'
import { generateUserToken } from '../../../utils/tokens'
import { namedScopes, registry } from '#auth/permissions'

// `POST /api/auth/me/tokens` (session only): creates an API token. 201 with the token, the only time its plaintext exists.
// Every scope must be one the caller may grant (`canGrantScope`: `authorization:before` and roles, no policies); the
// permissions they stand for are frozen on the row, so a token never does more than its user could when it was minted.
export default defineEventHandler(async (event): Promise<AuthCreatedTokenDto> => {
  const { user } = await requireAuth(event, { sessionOnly: true })
  const body = await readValidatedBody(event, createTokenSchema.parse)
  const scopes = [...new Set(body.scopes)]

  const unknown = scopes.filter(scope => !isKnownScope(scope, registry, namedScopes))
  if (unknown.length) {
    throw apiError(400, 'unknown_scope', `Unknown scopes: ${unknown.join(', ')}`, { scopes: unknown })
  }
  const refused: string[] = []
  for (const scope of scopes) {
    if (!(await canGrantScope(event, scope, { wildcardScopes: true }))) refused.push(scope)
  }
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
    scopes,
    permissions: await grantedScopePermissions(event, scopes, user),
    expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
  }).returning()

  // The plaintext token is returned this once; only its hash is stored.
  return created(event, { ...toAuthTokenDto(row!), token })
})
