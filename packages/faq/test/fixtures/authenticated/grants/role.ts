import { z } from 'zod'
import { defineGrantKind } from '@frigear-nu/auth/grants'
import { getEffectiveRoles } from '#imports'

// The `role` kind belongs to `@frigear-nu/authorization`, which this fixture leaves out (its roles come from
// `server/roles/provider.ts`). This stand-in has the same schema and matches auth's effective roles; it lists nobody.
export default defineGrantKind<{ kind: 'role', role: string }>('role', {
  schema: z.strictObject({ kind: z.literal('role'), role: z.string().trim().min(1).max(64) }),
  async matches({ event, user, grant }) {
    if (!user) return false
    return (await getEffectiveRoles(event, user as Parameters<typeof getEffectiveRoles>[1])).includes(grant.role)
  },
  members: () => [],
})
