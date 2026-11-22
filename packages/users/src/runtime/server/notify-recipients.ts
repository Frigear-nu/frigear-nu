import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { NotifyRecipientStore } from '@frigear-nu/notify/types'

// The recipient store of `@frigear-nu/notify` (registered in `module.ts`): where `notifyUser` finds a user's email,
// phone number and language. Without a language notify falls back to English texts.
const store: NotifyRecipientStore = {
  async findRecipient(userId) {
    const [row] = await db.select({ email: schema.users.email, phone: schema.users.phone, locale: schema.users.locale })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
    if (!row) return null
    return { email: row.email || null, phone: row.phone?.trim() || null, locale: row.locale || null }
  },
}

export default store
