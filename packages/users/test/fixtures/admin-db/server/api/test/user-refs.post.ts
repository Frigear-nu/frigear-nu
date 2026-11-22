import { z } from 'zod'

// Test only: the user lookups other modules call (`loadUserRefs`, `searchUserRefs`).
const bodySchema = z.object({
  ids: z.array(z.union([z.number(), z.string(), z.null()])).optional(),
  q: z.string().optional(),
  pii: z.boolean().optional(),
  limit: z.number().optional(),
})

export default defineEventHandler(async (event) => {
  const { ids, q, pii, limit } = await readValidatedBody(event, bodySchema.parse)
  return {
    refs: ids ? [...(await loadUserRefs(ids)).values()] : [],
    found: q === undefined ? [] : await searchUserRefs(q, { pii, limit }),
  }
})
