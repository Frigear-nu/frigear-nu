import { z } from 'zod'

/**
 * Router params with one non-empty string id, for `getValidatedRouterParams(event, idParams().parse)`.
 * Pass the param name for routes like `/forms/:id/tokens/:tokenId` (`idParams('tokenId')`).
 */
export const idParams = <const N extends string = 'id'>(name: N = 'id' as N) =>
  z.object({ [name]: z.string().trim().min(1) } as { [K in N]: z.ZodString })

/** Router params with one positive integer id (`/api/admin/users/:id`), coerced from the path segment. */
export const intIdParams = <const N extends string = 'id'>(name: N = 'id' as N) =>
  z.object({ [name]: z.coerce.number().int().positive() } as { [K in N]: z.ZodCoercedNumber<unknown> })
