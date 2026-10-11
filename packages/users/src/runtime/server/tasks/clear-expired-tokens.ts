import { db, schema } from '@nuxthub/db'
import { lt } from 'drizzle-orm'

// Removes magic links and password resets that expired more than a day ago.
export default defineTask({
  meta: {
    name: 'users:clear-expired-tokens',
    description: 'Remove expired magic links and password resets.',
  },
  async run() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    // Each table only exists when the feature owning it is enabled.
    const links = schema.magicLinks
      ? await db.delete(schema.magicLinks).where(lt(schema.magicLinks.expiresAt, cutoff)).returning({ id: schema.magicLinks.id })
      : []
    const resets = schema.passwordResets
      ? await db.delete(schema.passwordResets).where(lt(schema.passwordResets.expiresAt, cutoff)).returning({ id: schema.passwordResets.id })
      : []
    return { result: { magicLinks: links.length, passwordResets: resets.length } }
  },
})
