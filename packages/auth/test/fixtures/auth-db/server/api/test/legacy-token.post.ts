import { db, schema } from '@nuxthub/db'
import { generateUserToken } from '../../../../../../src/runtime/utils/tokens'

// Test helper: a token row as minted before permissions were frozen (`permissions` is null).
export default defineEventHandler(async (event) => {
  const { userId, scopes } = await readBody<{ userId: number, scopes: string[] }>(event)
  const { token, tokenHash, prefix, last4 } = await generateUserToken()
  await db.insert(schema.authUserTokens).values({ id: newTokenId(), userId: String(userId), name: 'legacy', tokenHash, prefix, last4, scopes })
  return { token }
})
