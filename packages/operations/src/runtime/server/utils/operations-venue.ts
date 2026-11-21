import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { PlaneFeatureCollection } from '@frigear-nu/maps/utils'
import type { OperationVenueLayout, OperationVenueUnderlay } from '../../../types'
import type { OperationRow } from './operations'

/**
 * Saves a validated venue layout. The underlay is the server's: the stored one stays unless the layout sends
 * `underlay: null`, which removes it (and deletes the image). Returns the updated row and the removed underlay.
 */
export async function saveOperationVenueLayout(existing: OperationRow, layout: PlaneFeatureCollection): Promise<{ row: OperationRow, removed: OperationVenueUnderlay | null }> {
  const stored = (existing.venueLayout as OperationVenueLayout | null)?.underlay ?? null
  const keep = layout.underlay === null ? null : stored
  const venueLayout: OperationVenueLayout = {
    type: 'FeatureCollection',
    features: layout.features,
    extent: layout.extent ?? null,
    underlay: keep,
  }
  const [row] = await db.update(schema.operations).set({ venueLayout }).where(eq(schema.operations.id, existing.id)).returning()
  return { row: row!, removed: stored && !keep ? stored : null }
}

/** Puts a newly stored underlay under the venue layout (creating an empty layout); returns the row and the old underlay. */
export async function setOperationVenueUnderlay(existing: OperationRow, underlay: OperationVenueUnderlay): Promise<{ row: OperationRow, replaced: OperationVenueUnderlay | null }> {
  const layout = (existing.venueLayout as OperationVenueLayout | null) ?? { type: 'FeatureCollection', features: [] }
  const venueLayout: OperationVenueLayout = { ...layout, underlay }
  const [row] = await db.update(schema.operations).set({ venueLayout }).where(eq(schema.operations.id, existing.id)).returning()
  const replaced = layout.underlay && layout.underlay.pathname !== underlay.pathname ? layout.underlay : null
  return { row: row!, replaced }
}
