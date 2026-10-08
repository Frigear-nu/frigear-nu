import type { EventSummaryDto } from '../../../../types'

export default defineEventHandler((): Promise<EventSummaryDto[]> => listPublishedEvents())
