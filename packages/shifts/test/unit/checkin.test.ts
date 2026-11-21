import { describe, expect, it } from 'vitest'
import {
  checkInRuleFor,
  checkInSettingsOf,
  checkLocation,
  DEFAULT_CHECK_IN_RADIUS,
  exceptionOf,
  normalizeAutomationBatch,
  parseStationToken,
  stationTokenPayload,
  stationWindow,
  stationWindowAccepted,
} from '../../src/runtime/utils/checkin'
import { buildShiftDigestEmail } from '../../src/runtime/server/digest-email'

const bar = { point: { lat: 10.0167, lng: 20.0784 } }
// About 100 m north of the bar.
const near = { lat: 10.0176, lng: 20.0784 }
// About 300 m north.
const far = { lat: 10.0194, lng: 20.0784 }

describe('check-in settings', () => {
  it('falls back to the lead only, and always keeps the lead', () => {
    expect(checkInSettingsOf(null)).toEqual({ modes: ['lead'], location: null })
    expect(checkInRuleFor(null, 'team')).toEqual({ modes: ['lead'], location: null })
    expect(checkInRuleFor({ modes: ['station'] }, 'team').modes).toEqual(['station', 'lead'])
    // Unknown modes are dropped.
    expect(checkInRuleFor({ modes: ['station', 'teleport'] }, 'team').modes).toEqual(['station', 'lead'])
  })

  it('lets a team override the modes and the place, keeping what it leaves out', () => {
    const settings = { modes: ['station', 'daily'], location: bar, teams: { gate: { modes: ['location'] }, kitchen: { location: { point: far } } } }
    expect(checkInRuleFor(settings, 'gate')).toEqual({ modes: ['location', 'lead'], location: bar })
    expect(checkInRuleFor(settings, 'kitchen')).toEqual({ modes: ['station', 'daily', 'lead'], location: { point: far } })
    expect(checkInRuleFor(settings, 'other')).toEqual({ modes: ['station', 'daily', 'lead'], location: bar })
  })
})

describe('location check', () => {
  it('accepts a position within the default radius of a bare point', () => {
    expect(DEFAULT_CHECK_IN_RADIUS).toBe(150)
    expect(checkLocation(bar, near, 20)).toEqual({ ok: true })
  })

  it('refuses a position outside the radius, with the distance', () => {
    const result = checkLocation(bar, far, 20)
    expect(result).toMatchObject({ ok: false, reason: 'outside', radius: 150 })
    expect((result as { distance: number }).distance).toBeGreaterThan(250)
  })

  it('refuses an accuracy worse than the radius, even inside it', () => {
    expect(checkLocation(bar, near, 151)).toMatchObject({ ok: false, reason: 'inaccurate' })
    expect(checkLocation({ ...bar, radiusMeters: 500 }, far, 400)).toEqual({ ok: true })
    expect(checkLocation(bar, near, Number.NaN)).toMatchObject({ ok: false, reason: 'inaccurate' })
  })

  it('checks an area by its outline', () => {
    const area = { point: bar.point, area: [{ lat: 10.016, lng: 20.077 }, { lat: 10.018, lng: 20.077 }, { lat: 10.018, lng: 20.080 }, { lat: 10.016, lng: 20.080 }] }
    expect(checkLocation(area, near, 10)).toEqual({ ok: true })
    expect(checkLocation(area, far, 10)).toMatchObject({ ok: false, reason: 'outside' })
  })
})

describe('station windows', () => {
  const at = 1_800_000_000_000
  it('rotates every 30 seconds and accepts the current and the previous window only', () => {
    const window = stationWindow(at)
    expect(stationWindow(at + 30_000)).toBe(window + 1)
    expect(stationWindowAccepted(window, at)).toBe(true)
    expect(stationWindowAccepted(window - 1, at)).toBe(true)
    expect(stationWindowAccepted(window - 2, at)).toBe(false)
    expect(stationWindowAccepted(window + 1, at)).toBe(false)
  })

  it('signs the station and the window, and parses only well-formed tokens', () => {
    expect(stationTokenPayload('sst_ab', 12)).toBe('sst_ab:12')
    const signature = 'a'.repeat(43)
    expect(parseStationToken(`sst_0123abcd.123.${signature}`)).toEqual({ stationId: 'sst_0123abcd', window: 123, signature })
    expect(parseStationToken('sst_0123abcd.123')).toBeNull()
    expect(parseStationToken(`shf_0123.123.${signature}`)).toBeNull()
    expect(parseStationToken(`sst_0123.x1.${signature}`)).toBeNull()
    expect(parseStationToken('a64charcheckincodeofapass')).toBeNull()
  })
})

describe('exceptions', () => {
  const start = new Date('2027-07-01T10:00:00Z')
  const after = (minutes: number) => new Date(start.getTime() + minutes * 60_000)
  it('names no-shows, late check-ins and people not checked in after the grace', () => {
    expect(exceptionOf({ status: 'no_show', checkedInAt: null }, { startsAt: start }, after(5))).toEqual({ kind: 'no_show' })
    expect(exceptionOf({ status: 'no_show', checkedInAt: null }, { startsAt: start }, after(5), { claimedGrant: true })).toEqual({ kind: 'claimed_no_show' })
    expect(exceptionOf({ status: 'attended', checkedInAt: after(17) }, { startsAt: start }, after(20))).toEqual({ kind: 'late', lateMinutes: 17 })
    expect(exceptionOf({ status: 'attended', checkedInAt: after(-30) }, { startsAt: start }, after(20))).toBeNull()
    expect(exceptionOf({ status: 'assigned', checkedInAt: null }, { startsAt: start }, after(-1))).toBeNull()
    expect(exceptionOf({ status: 'assigned', checkedInAt: null }, { startsAt: start }, after(1))).toEqual({ kind: 'not_checked_in' })
    expect(exceptionOf({ status: 'assigned', checkedInAt: null }, { startsAt: start }, after(10), { graceMinutes: 30 })).toBeNull()
  })

  it('bounds the batch of the close task', () => {
    expect(normalizeAutomationBatch(undefined)).toBe(200)
    expect(normalizeAutomationBatch(5000)).toBe(1000)
    expect(normalizeAutomationBatch(-1)).toBe(200)
  })
})

describe('digest email', () => {
  it('lists every exception in the lead\'s language, and needs an address and a line', () => {
    const lines = [{ kind: 'no_show' as const, name: 'Ann', team: 'Bar', when: '1 Jul 10:00' }, { kind: 'claimed_no_show' as const, name: 'Bo', team: 'Bar', when: '1 Jul 10:00' }]
    const email = buildShiftDigestEmail({ email: 'lead@example.com', name: 'Lea', lines, url: 'https://x.test/shifts/lead/t', locale: 'da' })!
    expect(email.subject).toBe('Vagter: 2 ting at se på')
    expect(email.text).toContain('Ann, Bar 1 Jul 10:00: udeblevet')
    expect(email.text).toContain('fordel allerede hentet')
    expect(email.template?.props?.url).toBe('https://x.test/shifts/lead/t')
    expect(buildShiftDigestEmail({ email: null, name: 'Lea', lines })).toBeNull()
    expect(buildShiftDigestEmail({ email: 'lead@example.com', name: 'Lea', lines: [] })).toBeNull()
  })
})
