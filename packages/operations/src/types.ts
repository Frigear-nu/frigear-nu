import type { H3Event } from 'h3'

import type { Translated } from '@frigear-nu/ui/translated'
import type { Schedule } from '@frigear-nu/module-kit/schedule'
import type { GeoPoint, MapLocation, PlaneFeature, PlaneFeatureCollection, PlaneUnderlay } from '@frigear-nu/maps/utils'

export type { Translated, Schedule, GeoPoint, MapLocation, PlaneFeature, PlaneFeatureCollection, PlaneUnderlay }

/** `planning -> active -> wrapped_up -> archived`, and `planning -> archived`. See `canTransition`. */
export type OperationStatus = 'planning' | 'active' | 'wrapped_up' | 'archived'

/**
 * Where an operation takes place: a name and an address to show, and the value of the location picker of
 * `@frigear-nu/maps` (`point`, with `radiusMeters` or an `area`). Any of them may be left out, not all.
 */
export type OperationLocation = Partial<MapLocation> & {
  name?: Translated
  address?: string
}

/** The image under a venue layout, as stored: the blob pathname never leaves the server. */
export type OperationVenueUnderlay = {
  pathname: string
  contentType: string
  width: number
  height: number
}

/** The venue layout as stored in `operations.venueLayout`: a plane layout whose underlay is a stored image. */
export type OperationVenueLayout = Omit<PlaneFeatureCollection, 'underlay'> & {
  underlay?: OperationVenueUnderlay | null
}

export type ModuleOptions = {
  settings?: {
    pages?: {
      /** The public page of a public operation; must contain a `:slug` param. On by default (`/operations/:slug`), `false` turns it off. */
      public?: string | boolean
      /** Staff operation list (needs the `operations:manage` permission). `true` = `/admin/operations`. Off by default. */
      admin?: string | boolean
      /** Staff operation page (details and the tabs other modules add); must contain an `:id` param. `true` = `/admin/operations/:id`. Off by default. */
      adminOperation?: string | boolean
    }
  }
}

export type PublicModuleOptions = {
  pages: { public?: string, admin?: string, adminOperation?: string }
  /** `@frigear-nu/events` is installed: the forms offer the `eventId` field. */
  events: boolean
}

/** What anybody who may read an operation sees (`GET /api/operations`, `/me` and `/:slug`). */
export type OperationDto = {
  id: string
  slug: string
  name: Translated
  description: Translated | null
  hostName: string | null
  hostUrl: string | null
  startsAt: string
  endsAt: string | null
  schedule: Schedule | null
  location: OperationLocation | null
  status: OperationStatus
  public: boolean
  /** The `@frigear-nu/events` event this operation belongs to, when there is one. */
  eventId: string | null
}

/** The staff view (`/api/admin/operations`): the same fields plus the audit dates. */
export type AdminOperationDto = OperationDto & {
  createdAt: string
  updatedAt: string
}

/** Context of `operations:created`. */
export type OperationCreatedContext = {
  event: H3Event
  operation: AdminOperationDto
}

/** Context of `operations:updated`: the fields were edited. A status move fires `operations:status-changed` only. */
export type OperationUpdatedContext = {
  event: H3Event
  operation: AdminOperationDto
  previous: AdminOperationDto
}

/** Context of `operations:status-changed`. */
export type OperationStatusChangedContext = {
  event: H3Event
  operation: AdminOperationDto
  from: OperationStatus
  to: OperationStatus
}

/**
 * Context of `operations:participation:resolve`: listeners add the ids of the operations `user` takes part in. Crew
 * answers it with the operations whose teams the user is an active member of. Identify the user from `ctx.user`, never
 * from the session on `ctx.event`: it is empty for bearer requests, and `event` is `undefined` outside a request.
 */
export type OperationsParticipationContext = {
  event: H3Event | undefined
  user: { id: string | number }
  operationIds: Set<string>
}

/**
 * Context of `operations:participants:resolve`: listeners add the ids (as text) of the users who take part in any of
 * `operationIds`. Keep every query under D1's 100 bound parameters (`chunkGrantParams` of `@frigear-nu/grants/core`).
 */
export type OperationsParticipantsContext = {
  event: H3Event | undefined
  operationIds: string[]
  userIds: Set<string>
}

/** The `operation` grant of `@frigear-nu/grants`: the users who take part in the operation. */
export type OperationGrant = { kind: 'operation', operationId: string }
