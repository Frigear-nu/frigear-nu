import { and, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { newId } from '@frigear-nu/teams/utils'
import { SEED_OPERATION_TEAM_KIND as TEAM_KIND, missingSeedOperationValues, seedOperation } from '../../seed/operation'

const sameText = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// Inserts our operation (server/seed/operation.ts) and its teams, or brings the stored operation up to date. Idempotent:
// the operation is found by its slug and a team by its name within the operation, so a second run writes nothing new.
// It never changes the status, never deletes a team and never touches the venue layout.
// Run it with `pnpm --filter ./apps/website exec nuxt task run seed:operation` (dev server running, from the repo root).
export default defineTask({
  meta: {
    name: 'seed:operation',
    description: 'Insert or update our own operation and its teams from server/seed/operation.ts.',
  },
  async run() {
    const missing = missingSeedOperationValues(seedOperation)
    if (missing.length) {
      return { result: { seeded: false, missing, message: `Fill in server/seed/operation.ts first: ${missing.join(', ')}.` } }
    }

    // The same validation as the staff form.
    const input = operationInput.parse({
      slug: seedOperation.slug,
      name: seedOperation.name,
      description: seedOperation.description,
      hostName: seedOperation.hostName,
      hostUrl: seedOperation.hostUrl,
      startsAt: seedOperation.startsAt,
      endsAt: seedOperation.endsAt,
      public: seedOperation.public,
      location: seedOperation.location,
    })

    const existing = await findOperationBySlug(input.slug)
    const operation = existing ? await patchOperationRow(existing, input) : await createOperationRow(input)

    const ladders = await loadTeamLadders()
    if (seedOperation.teams.length && !ladders[TEAM_KIND]) {
      throw new Error(`There is no ladder for the team kind "${TEAM_KIND}" (teams.ladders in nuxt.config.ts).`)
    }

    const stored = await db.select().from(schema.teams)
      .where(and(eq(schema.teams.ownerType, 'operation'), eq(schema.teams.ownerId, operation.id)))
    const createdTeams: string[] = []
    for (const [index, team] of seedOperation.teams.entries()) {
      if (stored.some(row => sameText(row.name, team.name))) continue
      // The owner is the operation just stored, so the owner check of `createTeamRow` (which needs a request) is moot.
      const [row] = await db.insert(schema.teams).values({
        id: newId('tem'),
        ownerType: 'operation',
        ownerId: operation.id,
        parentId: null,
        kind: TEAM_KIND,
        name: team.name,
        description: team.description ?? null,
        capacity: team.capacity ?? null,
        sort: index,
      }).returning()
      createdTeams.push(row!.id)
    }

    return {
      result: {
        seeded: true,
        operation: { id: operation.id, slug: operation.slug, created: !existing },
        teams: { created: createdTeams.length, kept: seedOperation.teams.length - createdTeams.length },
      },
    }
  },
})
