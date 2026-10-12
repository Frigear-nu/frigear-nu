import { db, schema } from '@nuxthub/db'
import { isGrantableScope } from '../../utils/scopes'
import { generateUserToken } from '../../utils/tokens'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { sessionOnly: true })
  const body = await readValidatedBody(event, createTokenSchema.parse)

  const registered = (await availableScopes(event, user as { id: number, role?: string })).map(scope => scope.name)
  const unknown = body.scopes.filter(scope => !isGrantableScope(scope, registered))
  if (unknown.length) {
    throw createError({ statusCode: 400, statusMessage: `Unknown scopes: ${unknown.join(', ')}` })
  }

  const days = body.expiresInDays === undefined ? useRuntimeConfig(event).authentication?.tokenTtlDays : body.expiresInDays
  const { token, tokenHash, prefix, last4 } = await generateUserToken()
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
  return { ...toPublicToken(row!), token }
})
