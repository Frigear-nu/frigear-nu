import { describe, expect, it } from 'vitest'
import { CREW_STATUSES, CREW_TRANSITIONS, canMoveCrew, crewStatusGrants, isCrewStatus, teamStatusOf } from '../../src/runtime/utils/status'
import { createCrewLinks } from '../../src/runtime/utils/links'
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

  it('never takes /crew itself: the mobile home tab defaults to it', () => {
    const links = createCrewLinks(undefined, path => path)
    for (const path of [links.apply('x'), links.status(), links.invite('t')]) expect(path).not.toBe('/crew')
  })

  it('encodes ids in the api paths', () => {
    expect(crewApi.admin.approve('tmm_a/b')).toBe('/api/admin/crew/members/tmm_a%2Fb/approve')
    expect(crewApi.apply('summer 2030')).toBe('/api/crew/operations/summer%202030/apply')
    expect(crewApi.me.withdraw('opr_1')).toBe('/api/crew/me/opr_1/withdraw')
  })
})
