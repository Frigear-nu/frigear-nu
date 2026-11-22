import { db, schema } from '@nuxthub/db'
import { and, eq, isNull } from 'drizzle-orm'
import { apiError } from '@frigear-nu/module-kit/server'
import type { PlaneFeatureCollection } from '@frigear-nu/maps/utils'
import type { OperationVenueLayout, OperationVenueUnderlay } from '../../../types'
import type { OperationRow } from './operations'
import { operationVenueRevision } from '../../utils/venue'

const changed = () => apiError(409, 'venue_layout_changed', 'The venue layout was changed since it was loaded. Reload it and try again.')

/** 409 `venue_layout_changed` when the client read another revision of the layout than the stored one. */
export function assertOperationVenueRevision(existing: OperationRow, revision: string | undefined): void {
  if (revision !== undefined && revision !== operationVenueRevision(existing.venueLayout)) throw changed()
}

/**
 * Writes `venueLayout` only while the row still holds the layout `existing` was read with (compare-and-set), so a
 * concurrent save or upload is never overwritten: 409 `venue_layout_changed` otherwise. Works on both dialects (the
 * JSON column is compared as drizzle stores it).
 */
async function writeOperationVenueLayout(existing: OperationRow, venueLayout: OperationVenueLayout): Promise<OperationRow> {
  const column = schema.operations.venueLayout
  const unchanged = existing.venueLayout === null || existing.venueLayout === undefined ? isNull(column) : eq(column, existing.venueLayout)
  const [row] = await db.update(schema.operations).set({ venueLayout }).where(and(eq(schema.operations.id, existing.id), unchanged)).returning()
  if (!row) throw changed()
  return row
}

/**
 * Saves a validated venue layout. The underlay is the server's: the stored one stays unless the layout sends
 * `underlay: null`, which removes it (and deletes the image). Conditional on the layout `existing` holds (409 when it
 * changed meanwhile). Returns the updated row and the removed underlay.
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
  const row = await writeOperationVenueLayout(existing, venueLayout)
  return { row, removed: stored && !keep ? stored : null }
}

/**
 * Puts a newly stored underlay under the venue layout (creating an empty layout), conditional on the layout `existing`
 * holds (409 when it changed meanwhile); returns the row and the old underlay.
 */
export async function setOperationVenueUnderlay(existing: OperationRow, underlay: OperationVenueUnderlay): Promise<{ row: OperationRow, replaced: OperationVenueUnderlay | null }> {
  const layout = (existing.venueLayout as OperationVenueLayout | null) ?? { type: 'FeatureCollection', features: [] }
  const row = await writeOperationVenueLayout(existing, { ...layout, underlay })
  const replaced = layout.underlay && layout.underlay.pathname !== underlay.pathname ? layout.underlay : null
  return { row, replaced }
}
