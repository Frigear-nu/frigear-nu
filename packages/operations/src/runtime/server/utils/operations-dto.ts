import type { schema } from '@nuxthub/db'
import { isoDate } from '@frigear-nu/module-kit/server'
import type { PlaneFeatureCollection } from '@frigear-nu/maps/utils'
import { operationsApi } from '../../utils/api'
import { operationVenueRevision } from '../../utils/venue'
import type { AdminOperationDto, OperationDto, OperationStatus, OperationVenueLayout, OperationVenueLayoutDto } from '../../../types'

type OperationRow = typeof schema.operations.$inferSelect

/** What anybody who may read the operation sees: an allowlist of the row's fields, dates as ISO strings. */
export function toOperationDto(row: OperationRow): OperationDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    hostName: row.hostName ?? null,
    hostUrl: row.hostUrl ?? null,
    startsAt: isoDate(row.startsAt),
    endsAt: isoDate(row.endsAt),
    schedule: row.schedule ?? null,
    location: row.location ?? null,
    status: row.status as OperationStatus,
    public: row.public,
    eventId: row.eventId ?? null,
  }
}

/** The staff view: the public one plus the audit dates. */
export function toAdminOperationDto(row: OperationRow): AdminOperationDto {
  return {
    ...toOperationDto(row),
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

/**
 * The venue layout as clients see it: the stored plane layout, with the underlay's blob pathname replaced by the URL of
 * the operation's underlay route (versioned by the stored file, so it may be cached). An operation without a layout has
 * an empty one.
 */
export function toOperationVenueLayoutDto(row: Pick<OperationRow, 'slug' | 'venueLayout'>): PlaneFeatureCollection {
  const layout = row.venueLayout as OperationVenueLayout | null
  if (!layout) return { type: 'FeatureCollection', features: [], extent: null, underlay: null }
  const underlay = layout.underlay
  return {
    type: 'FeatureCollection',
    features: layout.features ?? [],
    extent: layout.extent ?? null,
    underlay: underlay
      ? { url: `${operationsApi.venueUnderlay(row.slug)}?v=${encodeURIComponent(underlay.pathname.split('/').pop() ?? '')}`, width: underlay.width, height: underlay.height }
      : null,
  }
}

/** The venue layout for the staff editor: `toOperationVenueLayoutDto` plus the stored layout's `revision`. */
export function toOperationAdminVenueLayoutDto(row: Pick<OperationRow, 'slug' | 'venueLayout'>): OperationVenueLayoutDto {
  return { ...toOperationVenueLayoutDto(row), revision: operationVenueRevision(row.venueLayout) }
}
