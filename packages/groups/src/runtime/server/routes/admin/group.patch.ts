import { and, eq, ne } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { groupPatch } from '../../utils/admin-schemas'

export default defineEventHandler(async (event) => {
  await requireGroupsManager(event)
  const current = await findGroupById(getRouterParam(event, 'id')!)
  const input = await readValidatedBody(event, groupPatch.parse)

  if (input.slug && input.slug !== current.slug) {
    const [clash] = await db.select({ id: schema.userGroups.id }).from(schema.userGroups)
      .where(and(eq(schema.userGroups.slug, input.slug), ne(schema.userGroups.id, current.id))).limit(1)
    if (clash) throw createError({ statusCode: 409, statusMessage: 'A group with this slug already exists.' })
  }

  const [row] = await db.update(schema.userGroups).set({
    ...(input.slug !== undefined && { slug: input.slug }),
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.icon !== undefined && { icon: input.icon }),
  }).where(eq(schema.userGroups.id, current.id)).returning()
  return toGroupDto(row ?? current, await countMembers(current.id))
})
