import type { H3Event } from 'h3'
import { setResponseStatus } from 'h3'

/** 201 Created with the new record's DTO. */
export function created<T>(event: H3Event, dto: T): T {
  setResponseStatus(event, 201)
  return dto
}

/** 204 No Content, for deletes and revokes. Return its result from the handler. */
export function noContent(event: H3Event): null {
  setResponseStatus(event, 204)
  return null
}

/** A date as an ISO string for a DTO; `null` stays `null`. Accepts dates, epoch milliseconds and date strings. */
export function isoDate(value: Date | number | string): string
export function isoDate(value: Date | number | string | null | undefined): string | null
export function isoDate(value: Date | number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return (value instanceof Date ? value : new Date(value)).toISOString()
}
