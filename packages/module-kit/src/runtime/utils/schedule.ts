import { z } from 'zod'

/** A recurring yearly moment in wall-clock time of the schedule's timezone. */
export type ScheduleMoment = {
  /** 1-12 */
  month: number
  /** 1-31 */
  day: number
  /** `HH:mm` */
  time: string
}

/**
 * When something is open: `always` (default), one fixed `range` of ISO date-times, or a `yearly` season that
 * repeats every year (`from` after `to` wraps over new year, e.g. 1 Nov - 1 Feb). `from` is inclusive and `to` exclusive.
 */
export type Schedule
  = | { type: 'always' }
    | { type: 'range', from?: string, to?: string }
    | { type: 'yearly', from: ScheduleMoment, to: ScheduleMoment, timezone: string }

const scheduleMoment = z.object({
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm.'),
}).refine(m => m.day <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m.month - 1]!, 'That day does not exist in the month.')

const isoDateTime = z.string().refine(v => !Number.isNaN(Date.parse(v)), 'Must be a date-time.')

export const scheduleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('always') }),
  z.object({ type: z.literal('range'), from: isoDateTime.optional(), to: isoDateTime.optional() }),
  z.object({
    type: z.literal('yearly'),
    from: scheduleMoment,
    to: scheduleMoment,
    timezone: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz })
        return true
      }
      catch {
        return false
      }
    }, 'Unknown timezone.'),
  }),
]).superRefine((schedule, ctx) => {
  if (schedule.type === 'range' && schedule.from && schedule.to && Date.parse(schedule.from) >= Date.parse(schedule.to)) {
    ctx.addIssue({ code: 'custom', message: 'The range must end after it starts.', path: ['to'] })
  }
  if (schedule.type === 'yearly' && JSON.stringify(schedule.from) === JSON.stringify(schedule.to)) {
    ctx.addIssue({ code: 'custom', message: 'The season must end after it starts.', path: ['to'] })
  }
})

/** Wall-clock parts of an instant in a timezone. */
function zonedParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(date).map(p => [p.type, Number(p.value)]),
  ) as Record<'month' | 'day' | 'hour' | 'minute', number>
  return parts
}

/** Orders a month/day/time within a year as one number (the year cancels out, so Feb 29 needs no special case). */
const slot = (month: number, day: number, hour: number, minute: number) => ((month * 100 + day) * 100 + hour) * 100 + minute

function momentSlot(moment: ScheduleMoment) {
  const [hour, minute] = moment.time.split(':').map(Number)
  return slot(moment.month, moment.day, hour!, minute!)
}

/** Whether the schedule is open at `now`. */
export function isScheduleOpen(schedule: Schedule | undefined, now: Date = new Date()): boolean {
  if (!schedule || schedule.type === 'always') return true

  if (schedule.type === 'range') {
    const time = now.getTime()
    if (schedule.from && time < Date.parse(schedule.from)) return false
    if (schedule.to && time >= Date.parse(schedule.to)) return false
    return true
  }

  const p = zonedParts(now, schedule.timezone)
  const current = slot(p.month, p.day, p.hour, p.minute)
  const from = momentSlot(schedule.from)
  const to = momentSlot(schedule.to)
  // A season that ends "before" it starts wraps over new year.
  return from < to ? current >= from && current < to : current >= from || current < to
}

/** The next instant (minute precision) at which a closed form opens again, or null when it never will. */
export function nextScheduleOpening(schedule: Schedule | undefined, now: Date = new Date()): Date | null {
  if (!schedule || schedule.type === 'always' || isScheduleOpen(schedule, now)) return null

  if (schedule.type === 'range') {
    return schedule.from && Date.parse(schedule.from) > now.getTime() ? new Date(schedule.from) : null
  }

  // Walk forward by day to the day of `from`, then by minute around it. At most ~366 + 2880 checks.
  const probe = new Date(Math.floor(now.getTime() / 60000) * 60000)
  for (let day = 0; day <= 367; day++) {
    const p = zonedParts(probe, schedule.timezone)
    if (p.month === schedule.from.month && p.day === schedule.from.day) {
      // The opening may be earlier in that day than `probe`'s time of day (and, in another zone, on the previous UTC day).
      for (let minute = -1440; minute < 1440; minute++) {
        const candidate = new Date(probe.getTime() + minute * 60000)
        if (candidate > now && !isScheduleOpen(schedule, new Date(candidate.getTime() - 60000)) && isScheduleOpen(schedule, candidate)) return candidate
      }
    }
    probe.setTime(probe.getTime() + 86400000)
  }
  return null
}
