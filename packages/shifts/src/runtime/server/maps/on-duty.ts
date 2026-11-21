import { db, schema } from '@nuxthub/db'
import { and, eq, inArray } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { MapDto, MapFeatureCollection, MapGeoJsonFeature } from '@frigear-nu/maps/utils'
import type { Translated } from '@frigear-nu/ui/translated'
import { shiftsAccess } from '../../access'
import { geometryAnchor } from '../../utils/location'

// The provider of the `shifts.on-duty` layer (`module.ts`, `extendMaps`), for the venue layouts of operations: one point
// per shift location on the map, with the team on duty there. Only shifts whose location names a feature of THIS map
// are drawn; a location on another map, or none at all, is skipped. Who is shown follows the "on shift now" view:
// people who take part in the operation and staff, and names only with `shifts:pii`.
export default async function shiftsOnDuty(event: H3Event, map: MapDto): Promise<MapFeatureCollection> {
  const empty: MapFeatureCollection = { type: 'FeatureCollection', features: [] }
  if (map.ownerType !== 'operation' || !map.ownerId) return empty
  // The record rule of `shifts:read` for an operation: taking part in it, or staff. A layer must not show more than
  // `GET /api/shifts/operations/:id/now` does.
  if (!(await allows(event, shiftsAccess.permissions.read, { operationId: map.ownerId }))) return empty
  const pii = await allows(event, shiftsAccess.permissions.pii)

  const now = await shiftsNow(event, map.ownerId, false)
  type Spot = { teamId: string, team: Translated, featureId: string, people: Set<number>, leads: Map<number, string | null> }
  const spots = new Map<string, Spot>()
  for (const team of now.teams) {
    const leadIds = new Map(team.leads.map(lead => [lead.userId, lead.name]))
    for (const shift of team.shifts) {
      const featureId = shift.location?.mapId === map.id ? shift.location.featureId : undefined
      if (!featureId) continue
      const key = `${team.teamId}:${featureId}`
      let spot = spots.get(key)
      if (!spot) spots.set(key, spot = { teamId: team.teamId, team: team.teamName, featureId, people: new Set(), leads: new Map() })
      for (const assignee of shift.assignees) {
        spot.people.add(assignee.userId)
        if (leadIds.has(assignee.userId)) spot.leads.set(assignee.userId, leadIds.get(assignee.userId) ?? null)
      }
    }
  }
  if (!spots.size) return empty

  const rows = await db.select({ id: schema.mapFeatures.id, geometry: schema.mapFeatures.geometry }).from(schema.mapFeatures)
    .where(and(eq(schema.mapFeatures.mapId, map.id), inArray(schema.mapFeatures.id, [...new Set([...spots.values()].map(spot => spot.featureId))])))
  const geometries = new Map(rows.map(row => [row.id, row.geometry as { type: string, coordinates: unknown }]))

  const features: MapGeoJsonFeature[] = []
  for (const [key, spot] of spots) {
    const anchor = geometryAnchor(geometries.get(spot.featureId))
    if (!anchor) continue
    features.push({
      type: 'Feature',
      id: key,
      geometry: { type: 'Point', coordinates: anchor },
      properties: {
        teamId: spot.teamId,
        team: spot.team,
        featureId: spot.featureId,
        onNow: spot.people.size,
        leadsOnDuty: spot.leads.size,
        // Names of the leads on duty only for staff who may see people's details.
        ...(pii ? { leads: [...spot.leads.values()].filter((name): name is string => !!name) } : {}),
      },
    })
  }
  return { type: 'FeatureCollection', features }
}
