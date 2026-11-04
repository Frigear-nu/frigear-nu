import type { AuthClientUserContext } from '../../../src/runtime/client/core'

export default async ({ claims, userinfo }: AuthClientUserContext) => ({
  id: claims.sub,
  name: claims.name ?? '',
  role: (await userinfo()).role as string | undefined,
})
