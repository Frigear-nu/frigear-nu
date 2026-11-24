import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CREW_STATUSES, CREW_TRANSITIONS, canMoveCrew, crewApplyNotice, crewStatusGrants, isCrewStatus, teamStatusOf } from '../../src/runtime/utils/status'
import type { CrewStatus } from '../../src/types'
import { CREW_INVITE_DEFAULT_DAYS, createCrewLinks, crewStatusPath } from '../../src/runtime/utils/links'
import { crewApi } from '../../src/runtime/utils/api'

describe('crew statuses', () => {
  it('maps every status to the status teams stores: only an approved person is active', () => {
    expect(CREW_STATUSES.map(status => [status, teamStatusOf(status)])).toEqual([
      ['applied', 'pending'],
      ['waitlisted', 'pending'],
      ['approved', 'active'],
      ['rejected', 'inactive'],
      ['withdrawn', 'inactive'],
    ])
    expect(CREW_STATUSES.filter(crewStatusGrants)).toEqual(['approved'])
    // Teams' own rule: only `null` and `active` grant, so exactly the approved status does.
    expect(CREW_STATUSES.filter(status => teamStatusOf(status) === 'active')).toEqual(['approved'])
  })

  it('knows its statuses', () => {
    expect(isCrewStatus('approved')).toBe(true)
    expect(isCrewStatus('pending')).toBe(false)
    expect(isCrewStatus(undefined)).toBe(false)
  })

  it('only allows the moves of the table, never a status to itself', () => {
    for (const from of CREW_STATUSES) {
      expect(canMoveCrew(from, from)).toBe(false)
      for (const to of CREW_TRANSITIONS[from]) expect(canMoveCrew(from, to)).toBe(true)
    }
    expect(canMoveCrew('applied', 'approved')).toBe(true)
    expect(canMoveCrew('approved', 'waitlisted')).toBe(true)
    expect(canMoveCrew('withdrawn', 'rejected')).toBe(false)
    // A withdrawn person has left: staff cannot approve them, they apply again.
    expect(canMoveCrew('withdrawn', 'approved')).toBe(false)
    expect(canMoveCrew('waitlisted', 'applied')).toBe(false)
  })
})

describe('crew links and api paths', () => {
  const localize = (path: string) => `/da${path}`

  it('builds the page links on the default paths, localized', () => {
    const links = createCrewLinks(undefined, localize)
    expect(links.apply('summer-2030')).toBe('/da/crew/apply/summer-2030')
    expect(links.status()).toBe('/da/crew/status')
    expect(links.invite('cvt_abc')).toBe('/da/crew/invite/cvt_abc')
  })

  it('follows the configured paths and encodes the parameters', () => {
    const links = createCrewLinks({ apply: '/join/:operationSlug', status: '/me/crew', invite: '/i/:token' }, path => path)
    expect(links.apply('a b')).toBe('/join/a%20b')
    expect(links.status()).toBe('/me/crew')
    expect(links.invite('x/y')).toBe('/i/x%2Fy')
  })

  it('links My crew to the tab of the crew home when there is no status page', () => {
    const links = createCrewLinks({ home: '/dashboard/crew' }, localize)
    expect(links.status()).toBe('/da/dashboard/crew?tab=status')
    expect(links.home()).toBe('/da/dashboard/crew')
    expect(links.home('overview')).toBe('/da/dashboard/crew')
    expect(links.home('shifts')).toBe('/da/dashboard/crew?tab=shifts')
    // A status page wins over the tab; with neither there is no status to link (emails go out without one).
    expect(crewStatusPath({ home: '/dashboard/crew', status: '/me/crew' })).toBe('/me/crew')
    expect(crewStatusPath({})).toBeUndefined()
  })

  it('never takes /crew itself: the mobile home tab defaults to it', () => {
    const links = createCrewLinks(undefined, path => path)
    for (const path of [links.apply('x'), links.status(), links.invite('t')]) expect(path).not.toBe('/crew')
  })

  it('encodes ids in the api paths', () => {
    expect(crewApi.admin.approve('tmm_a/b')).toBe('/api/admin/crew/members/tmm_a%2Fb/approve')
    expect(crewApi.apply('summer 2030')).toBe('/api/crew/operations/summer%202030/apply')
    expect(crewApi.admin.withdraw('tmm_1')).toBe('/api/admin/crew/members/tmm_1/withdraw')
  })
})

describe('crew invites', () => {
  it('keeps invites for 30 days by default', () => {
    expect(CREW_INVITE_DEFAULT_DAYS).toBe(30)
  })
})

describe('the apply notice', () => {
  const lang = (code: 'en' | 'da') => JSON.parse(readFileSync(fileURLToPath(new URL(`../../src/runtime/i18n/lang/${code}.json`, import.meta.url)), 'utf8')).crew as Record<string, unknown>
  const text = (code: 'en' | 'da', key: string) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], lang(code)) as string | undefined
  const rendered = (status: CrewStatus | null, code: 'en' | 'da', submitted = false) => {
    const notice = crewApplyNotice(status, submitted)
    return { color: notice.color, title: text(code, notice.title.key), description: text(code, notice.description.key) }
  }

  it('tells a waitlisted person they are on the waiting list, not that they applied', () => {
    expect(rendered('waitlisted', 'en')).toEqual({ color: 'neutral', title: 'You\'re on the waiting list', description: 'We will email you if a place opens up.' })
    expect(rendered('waitlisted', 'da')).toEqual({ color: 'neutral', title: 'Du er på ventelisten', description: 'Vi sender dig en e-mail, hvis der bliver en plads.' })
    expect(rendered('waitlisted', 'en', true).title).toBe('You\'re on the waiting list')
  })

  it('tells an applicant their application is received, and an approved person they are on the crew', () => {
    expect(rendered('applied', 'en')).toEqual({ color: 'success', title: 'You have applied already', description: 'We have received your application. We will email you when something changes.' })
    expect(rendered('applied', 'da')).toEqual({ color: 'success', title: 'Du har allerede ansøgt', description: 'Vi har modtaget din ansøgning. Vi sender dig en e-mail, når der sker noget.' })
    expect(rendered('applied', 'en', true).title).toBe('Thank you for applying')
    expect(rendered('approved', 'en')).toMatchObject({ color: 'success', description: 'You are on the crew.' })
  })

  it('falls back to the English texts', () => {
    for (const status of ['applied', 'waitlisted', 'approved'] as const) {
      const notice = crewApplyNotice(status)
      expect(notice.title.fallback).toBe(text('en', notice.title.key))
      expect(notice.description.fallback).toBe(text('en', notice.description.key))
    }
  })
})
