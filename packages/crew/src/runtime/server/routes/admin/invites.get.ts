import { desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { idParams } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import type { CrewInviteDto } from '../../../../types'

// An operation's invite links, newest first. Never the tokens: they were shown once, on creation.
export default defineEventHandler(async (event): Promise<CrewInviteDto[]> => {
  await authorize(event, crewAccess.permissions.manage)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, crewAccess.permissions.manage, operation)
  const rows = await db.select().from(schema.crewInvites).where(eq(schema.crewInvites.operationId, operation.id)).orderBy(desc(schema.crewInvites.createdAt), desc(schema.crewInvites.id))
  const teams = rows.length ? await db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams).where(inArray(schema.teams.id, [...new Set(rows.map(row => row.teamId))])) : []
  const names = new Map(teams.map(team => [team.id, team.name]))
  return rows.map(row => toCrewInviteDto(row, names.get(row.teamId) ?? null))
})
