import { idParams } from '@frigear-nu/module-kit/server'

// Replaces the client secret (the old one stops working at once) and returns the new one once.
export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const { secret } = await rotateApplicationSecret(id)
  return { clientSecret: secret }
})
