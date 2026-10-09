import { inArray } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { SeedForm } from '../../../types'
import { newId, parseFormDefinition } from '../../utils'

/**
 * Inserts the given forms, skipping every slug that already exists. Never updates anything, so
 * edits made in the admin are safe. Returns what was inserted and what was skipped.
 */
export async function seedForms(forms: SeedForm[]): Promise<{ inserted: string[], skipped: string[] }> {
  if (!forms.length) return { inserted: [], skipped: [] }

  const existing = await db.select({ slug: schema.forms.slug }).from(schema.forms)
    .where(inArray(schema.forms.slug, forms.map(form => form.slug)))
  const taken = new Set(existing.map(row => row.slug))

  const inserted: string[] = []
  for (const form of forms) {
    if (taken.has(form.slug)) continue
    await db.insert(schema.forms).values({
      id: newId('frm'),
      slug: form.slug,
      name: form.name,
      status: form.status ?? 'draft',
      definition: parseFormDefinition(form.definition),
    })
    inserted.push(form.slug)
    taken.add(form.slug)
  }
  return { inserted, skipped: forms.map(form => form.slug).filter(slug => !inserted.includes(slug)) }
}
