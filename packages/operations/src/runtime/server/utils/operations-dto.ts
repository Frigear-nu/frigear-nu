import type { schema } from '@nuxthub/db'
import { isoDate } from '@frigear-nu/module-kit/server'
import type { AdminOperationDto, OperationDto, OperationStatus } from '../../../types'

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
