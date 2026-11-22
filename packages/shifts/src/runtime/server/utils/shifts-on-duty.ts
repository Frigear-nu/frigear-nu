import type { H3Event } from 'h3'
import { geometryAnchor } from '@frigear-nu/maps/utils'
import type { MapLiveFeature, MapLiveFeatureCollection, PlaneFeatureCollection } from '@frigear-nu/maps/utils'
import type { Translated } from '@frigear-nu/ui/translated'

/**
 * The `shifts.on-duty` live layer of an operation: one point per team and shift location, at the anchor of the venue
 * layout's feature the location names (a point as it is, a line at its middle, an area at its centroid). `count` is
 * how many people of the team are on shift there now; `leads` (the names of the leads on duty) only with `pii`.
 * Shifts without a location, or naming a feature the layout does not have, are left out.
 */
export async function shiftsOnDutyLayer(event: H3Event, operation: { id: string, venueLayout?: unknown }, pii: boolean, at = new Date()): Promise<MapLiveFeatureCollection> {
  const layout = operation.venueLayout as Pick<PlaneFeatureCollection, 'features'> | null | undefined
  const anchors = new Map((layout?.features ?? []).map(feature => [feature.id, geometryAnchor(feature.geometry)]))
  if (!anchors.size) return { type: 'FeatureCollection', features: [] }

  const now = await shiftsNow(event, operation.id, false, at)
  type Spot = { teamId: string, team: Translated, featureId: string, people: Set<number>, leads: Map<number, string | null> }
  const spots = new Map<string, Spot>()
  for (const team of now.teams) {
    const leadNames = new Map(team.leads.map(lead => [lead.userId, lead.name]))
    for (const shift of team.shifts) {
      const featureId = shift.location?.featureId
      if (!featureId || !anchors.get(featureId)) continue
      const key = `${team.teamId}:${featureId}`
      let spot = spots.get(key)
      if (!spot) spots.set(key, spot = { teamId: team.teamId, team: team.teamName, featureId, people: new Set(), leads: new Map() })
      for (const assignee of shift.assignees) {
        spot.people.add(assignee.userId)
        if (leadNames.has(assignee.userId)) spot.leads.set(assignee.userId, leadNames.get(assignee.userId) ?? null)
      }
    }
  }

  const features: MapLiveFeature[] = [...spots.entries()].map(([key, spot]) => ({
    type: 'Feature',
    id: key,
    geometry: { type: 'Point', coordinates: anchors.get(spot.featureId)! },
    properties: {
      label: spot.team,
      teamId: spot.teamId,
      featureId: spot.featureId,
      count: spot.people.size,
      leadsOnDuty: spot.leads.size,
      // The names of the leads on duty only for staff who may see people's details.
      ...(pii ? { leads: [...spot.leads.values()].filter((name): name is string => !!name) } : {}),
    },
  }))
  return { type: 'FeatureCollection', features }
}
