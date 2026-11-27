import { db, schema } from '@nuxthub/db'
import type { CampaignFormOptionDto, Translated } from '../../../types'

// The forms of `@frigear-nu/forms` staff can map to a list. Only called when forms is installed (its `forms` table
// exists); typed loosely, since campaigns does not depend on forms.

type CampaignsFormRow = {
  id: string
  slug: string
  name: string
  status: string
  definition: { steps?: Array<{ fields?: Array<{ key: string, type: string, label?: Translated }> }> }
}

/** Field types that collect no text answer a signup can use. */
const SKIPPED_FIELD_TYPES = new Set(['markdown', 'file', 'captcha'])

/** The forms that are not archived, by name, with their fields (of the first 1000 forms). */
export async function campaignsFormOptions(): Promise<CampaignFormOptionDto[]> {
  const forms = (schema as unknown as Record<string, unknown>).forms
  if (!forms) return []
  const rows = await db.select().from(forms as typeof schema.campaignLists).limit(1000) as unknown as CampaignsFormRow[]
  return rows
    .filter(row => row.status !== 'archived')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(row => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      fields: (row.definition?.steps ?? []).flatMap(step => step.fields ?? [])
        .filter(field => !SKIPPED_FIELD_TYPES.has(field.type))
        .map(field => ({ key: field.key, type: field.type, label: field.label ?? null })),
    }))
}
