import type { FormSchedule, FormScheduleMoment } from '../../types'

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

function momentSlot(moment: FormScheduleMoment) {
  const [hour, minute] = moment.time.split(':').map(Number)
  return slot(moment.month, moment.day, hour!, minute!)
}

/** Whether the schedule accepts answers at `now`. */
export function isFormOpen(schedule: FormSchedule | undefined, now: Date = new Date()): boolean {
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
export function nextFormOpening(schedule: FormSchedule | undefined, now: Date = new Date()): Date | null {
  if (!schedule || schedule.type === 'always' || isFormOpen(schedule, now)) return null

  if (schedule.type === 'range') {
    return schedule.from && Date.parse(schedule.from) > now.getTime() ? new Date(schedule.from) : null
  }

  // Walk forward by day to the day of `from`, then by minute inside it. At most ~366 + 1440 checks.
  const probe = new Date(Math.floor(now.getTime() / 60000) * 60000)
  for (let day = 0; day <= 367; day++) {
    const p = zonedParts(probe, schedule.timezone)
    if (p.month === schedule.from.month && p.day === schedule.from.day) {
      for (let minute = 0; minute < 1440 * 2; minute++) {
        const candidate = new Date(probe.getTime() + minute * 60000)
        if (candidate > now && !isFormOpen(schedule, new Date(candidate.getTime() - 60000)) && isFormOpen(schedule, candidate)) return candidate
      }
    }
    probe.setTime(probe.getTime() + 86400000)
  }
  return null
}
