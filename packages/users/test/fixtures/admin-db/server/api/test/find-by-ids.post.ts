import { z } from 'zod'
import store from '../../../../../../src/runtime/server/user-store'

// Test-only: the user store's `findByIds` (auth's batch lookup for role holders), answering the ids it found.
export default defineEventHandler(async (event) => {
  const { ids } = await readValidatedBody(event, z.object({ ids: z.array(z.union([z.number(), z.string()])) }).parse)
  const users = await store.findByIds!(ids)
  return users.map(user => user.id).sort((a, b) => a - b)
})
