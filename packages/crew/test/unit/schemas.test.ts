import { describe, expect, it } from 'vitest'
import { crewApproveInput, crewBulkApproveInput, crewInviteInput, crewMemberPatchSchema, crewMembersQuery, crewSettingsInput } from '../../src/runtime/server/utils/crew-schemas'
import { crewGenerateToken, crewHashToken } from '../../src/runtime/server/utils/crew-tokens'
import { crewInviteStatus, toCrewMemberDto, toCrewSettingsDto } from '../../src/runtime/server/utils/crew-dto'

describe('crew input schemas', () => {
  it('reads the settings as a whole record with defaults, and dates as instants', () => {
    const parsed = crewSettingsInput.parse({ formId: 'frm_1', opensAt: '2027-01-01T00:00:00.000Z', statusEmails: { approved: { enabled: false } } })
    expect(parsed).toMatchObject({ formId: 'frm_1', waitlist: true, previousCrewFirst: false, presets: true })
    expect(parsed.opensAt).toEqual(new Date('2027-01-01T00:00:00.000Z'))
    expect(crewSettingsInput.safeParse({ opensAt: '2027-01-01' }).success).toBe(false)
    expect(crewSettingsInput.safeParse({ opensAt: '2027-02-01T00:00:00.000Z', closesAt: '2027-01-01T00:00:00.000Z' }).success).toBe(false)
    expect(crewSettingsInput.safeParse({ capacity: -1 }).success).toBe(false)
    expect(crewSettingsInput.safeParse({ statusEmails: { unknown: {} } }).success).toBe(false)
  })

  it('needs a team or a role to move somebody, and ids to approve in bulk', () => {
    expect(crewMemberPatchSchema.safeParse({}).success).toBe(false)
    expect(crewMemberPatchSchema.safeParse({ role: 'lead' }).success).toBe(true)
    expect(crewApproveInput.parse(undefined)).toEqual({})
    expect(crewBulkApproveInput.safeParse({ ids: [] }).success).toBe(false)
    expect(crewBulkApproveInput.safeParse({ ids: Array.from({ length: 201 }, (_, index) => `tmm_${index}`) }).success).toBe(false)
  })

  it('limits invites to a sane number of uses', () => {
    expect(crewInviteInput.parse({ teamId: 'tem_1', role: 'lead' }).maxUses).toBe(1)
    expect(crewInviteInput.safeParse({ teamId: 'tem_1', role: 'lead', maxUses: 0 }).success).toBe(false)
    expect(crewInviteInput.safeParse({ teamId: 'tem_1', role: 'lead', maxUses: 1001 }).success).toBe(false)
  })

  it('reads the members query: sorts and filters it knows, defaults to the newest applications', () => {
    expect(crewMembersQuery.parse({})).toMatchObject({ page: 1, sort: 'appliedAt', order: 'desc' })
    expect(crewMembersQuery.parse({ status: 'waitlisted', previous: 'true', sort: 'previousCrew' })).toMatchObject({ status: 'waitlisted', previous: 'true', sort: 'previousCrew' })
    expect(crewMembersQuery.safeParse({ status: 'pending' }).success).toBe(false)
    expect(crewMembersQuery.safeParse({ sort: 'email' }).success).toBe(false)
  })
})

describe('invite tokens', () => {
  it('hashes a token to a stable, URL-safe value that is not the token', async () => {
    const hash = await crewHashToken('cvt_abc')
    expect(hash).toBe(await crewHashToken('cvt_abc'))
    expect(hash).not.toBe(await crewHashToken('cvt_abd'))
    expect(hash).toMatch(/^[\w-]{43}$/)
  })

  it('generates distinct tokens with a recognisable prefix and the hash of the token', async () => {
    const [a, b] = [await crewGenerateToken(), await crewGenerateToken()]
    expect(a.token).toMatch(/^cvt_[\w-]{43}$/)
    expect(a.token).not.toBe(b.token)
    expect(a.prefix).toBe(a.token.slice(0, 8))
    expect(a.tokenHash).toBe(await crewHashToken(a.token))
  })
})

describe('crew DTOs', () => {
  const invite = { revokedAt: null, expiresAt: null, uses: 0, maxUses: 2 }

  it('derives an invite\'s status: revoked beats expired beats used up', () => {
    const now = new Date('2027-01-01T00:00:00.000Z')
    expect(crewInviteStatus(invite, now)).toBe('active')
    expect(crewInviteStatus({ ...invite, uses: 2 }, now)).toBe('used')
    expect(crewInviteStatus({ ...invite, expiresAt: new Date('2026-12-31T00:00:00.000Z') }, now)).toBe('expired')
    expect(crewInviteStatus({ ...invite, expiresAt: new Date('2027-01-02T00:00:00.000Z') }, now)).toBe('active')
    expect(crewInviteStatus({ ...invite, uses: 2, expiresAt: new Date('2026-12-31T00:00:00.000Z'), revokedAt: new Date() }, now)).toBe('revoked')
  })

  const row = { id: 'tmm_1', teamId: 'tem_1', userId: 7, role: 'volunteer', status: 'pending', addedBy: null, crewStatus: 'applied', appliedAt: new Date('2027-01-01T00:00:00.000Z'), decidedAt: null, decidedBy: null, submissionId: 'fsb_1', waitlistPosition: null, createdAt: new Date(), updatedAt: new Date() }
  const team = { id: 'tem_1', name: { en: 'Crew' }, ownerId: 'opr_1' }
  const user = { name: 'Ada', email: 'ada@example.com', avatar: null, phone: '+15550100101' }

  it('leaves the email and phone out of a member without pii', () => {
    const without = toCrewMemberDto({ member: row, team, user, previous: false, pii: false })
    expect(without).not.toHaveProperty('email')
    expect(without).not.toHaveProperty('phone')
    expect(without).toMatchObject({ operationId: 'opr_1', name: 'Ada', crewStatus: 'applied', appliedAt: '2027-01-01T00:00:00.000Z', submissionId: 'fsb_1' })
    expect(toCrewMemberDto({ member: row, team, user, previous: true, pii: true })).toMatchObject({ email: 'ada@example.com', phone: '+15550100101', previousCrew: true })
  })

  it('answers the defaults of an operation without saved settings', () => {
    expect(toCrewSettingsDto('opr_1', undefined, 3)).toEqual({
      operationId: 'opr_1', formId: null, defaultTeamId: null, capacity: null, waitlist: true, previousCrewFirst: false, opensAt: null, closesAt: null, statusEmails: {}, presets: true, source: 'default', approved: 3, createdAt: null, updatedAt: null,
    })
  })
})
