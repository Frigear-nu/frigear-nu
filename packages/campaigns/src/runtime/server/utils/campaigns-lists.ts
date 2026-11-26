import { db, schema } from '@nuxthub/db'
import { asc, count, eq, inArray } from 'drizzle-orm'
import { conflict, inChunks, isUniqueViolation, notFound } from '@frigear-nu/module-kit/server'
import { newId } from '@frigear-nu/module-kit/id'
import type { z } from 'zod'
import type { CampaignChannel, CampaignListCounts, CampaignSubscriptionStatus } from '../../../types'
import type { campaignListCreateInput, campaignListPatchInput } from '../../utils/schemas'
import { campaignsEmptyCounts } from './campaigns-dto'
import type { CampaignListRow } from './campaigns-dto'

type ListCreate = z.output<typeof campaignListCreateInput>
type ListPatch = z.output<typeof campaignListPatchInput>

/** A list by its slug, or `undefined`. */
export async function findCampaignListBySlug(slug: string): Promise<CampaignListRow | undefined> {
  const [row] = await db.select().from(schema.campaignLists).where(eq(schema.campaignLists.slug, slug)).limit(1)
  return row
}

/** A public list by its slug, or 404: a list that is not public is not found either. */
export async function getPublicCampaignListOr404(slug: string): Promise<CampaignListRow> {
  const row = await findCampaignListBySlug(slug)
  if (!row || !row.public) throw notFound('Newsletter not found.')
  return row
}

/** A list by id, or 404. */
export async function getCampaignListOr404(id: string): Promise<CampaignListRow> {
  const [row] = await db.select().from(schema.campaignLists).where(eq(schema.campaignLists.id, id)).limit(1)
  if (!row) throw notFound('Newsletter not found.')
  return row
}

/** Every list, oldest first. */
export async function listCampaignLists(): Promise<CampaignListRow[]> {
  return db.select().from(schema.campaignLists).orderBy(asc(schema.campaignLists.createdAt), asc(schema.campaignLists.id))
}

/** Subscriber counts per list, channel and status. */
export async function campaignListCounts(listIds: string[]): Promise<Map<string, CampaignListCounts>> {
  const s = schema.campaignSubscriptions
  const rows = await inChunks(listIds, ids => db.select({ listId: s.listId, channel: s.channel, status: s.status, total: count() })
    .from(s).where(inArray(s.listId, ids)).groupBy(s.listId, s.channel, s.status))
  const counts = new Map<string, CampaignListCounts>(listIds.map(id => [id, campaignsEmptyCounts()]))
  for (const row of rows) {
    const entry = counts.get(row.listId)?.[row.channel as CampaignChannel]
    if (entry) entry[row.status as CampaignSubscriptionStatus] = Number(row.total)
  }
  return counts
}

const slugTaken = () => conflict('Another newsletter has that URL name.', { field: 'slug' })

/** Creates a list; 409 `conflict` when the slug is taken. */
export async function createCampaignList(input: ListCreate): Promise<CampaignListRow> {
  const values = {
    id: newId('cml'),
    slug: input.slug,
    name: input.name,
    description: input.description ?? null,
    channels: input.channels,
    doubleOptIn: input.doubleOptIn,
    public: input.public,
    consentText: input.consentText ?? null,
    consentVersion: 1,
    formId: input.formId ?? null,
    formFields: input.formFields ?? null,
  }
  try {
    await db.insert(schema.campaignLists).values(values)
  }
  catch (error) {
    if (isUniqueViolation(error)) throw slugTaken()
    throw error
  }
  return getCampaignListOr404(values.id)
}

const sameText = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Changes a list. A changed consent text bumps `consentVersion`, so consent proofs tell the texts apart. */
export async function updateCampaignList(list: CampaignListRow, patch: ListPatch): Promise<CampaignListRow> {
  const changes: Partial<typeof schema.campaignLists.$inferInsert> = {}
  for (const key of ['slug', 'name', 'description', 'channels', 'doubleOptIn', 'public', 'formId', 'formFields'] as const) {
    if (patch[key] !== undefined) (changes as Record<string, unknown>)[key] = patch[key]
  }
  if (patch.consentText !== undefined && !sameText(patch.consentText, list.consentText)) {
    changes.consentText = patch.consentText
    changes.consentVersion = list.consentVersion + 1
  }
  if (!Object.keys(changes).length) return list
  try {
    await db.update(schema.campaignLists).set({ ...changes, updatedAt: new Date() }).where(eq(schema.campaignLists.id, list.id))
  }
  catch (error) {
    if (isUniqueViolation(error)) throw slugTaken()
    throw error
  }
  return getCampaignListOr404(list.id)
}

/** Deletes a list and its subscriptions. Contacts stay: they may be on other lists. */
export async function deleteCampaignList(list: CampaignListRow): Promise<void> {
  // Explicit, so it does not rely on foreign keys being enforced (sqlite needs a pragma for that).
  await db.delete(schema.campaignSubscriptions).where(eq(schema.campaignSubscriptions.listId, list.id))
  await db.delete(schema.campaignLists).where(eq(schema.campaignLists.id, list.id))
}
