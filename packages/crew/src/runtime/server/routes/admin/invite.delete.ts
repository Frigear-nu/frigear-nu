import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { idParams, noContent, notFound } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'

// Revokes an invite link: it cannot be used any more. People who joined with it stay. Revoking twice is fine.
export default defineEventHandler(async (event) => {
  await authorize(event, crewAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const [invite] = await db.select().from(schema.crewInvites).where(eq(schema.crewInvites.id, id)).limit(1)
  if (!invite) throw notFound('Invite not found.')
  await authorize(event, crewAccess.permissions.manage, invite)
  if (!invite.revokedAt) await db.update(schema.crewInvites).set({ revokedAt: new Date() }).where(eq(schema.crewInvites.id, invite.id))
  return noContent(event)
})
