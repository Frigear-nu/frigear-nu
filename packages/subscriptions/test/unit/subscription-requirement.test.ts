import { beforeEach, describe, expect, it, vi } from 'vitest'

const hasActiveSubscription = vi.fn(async (_userId: number, _options: { plans?: string[] }) => true)
vi.mock('../../src/runtime/server/utils/subscriptions', () => ({ hasActiveSubscription }))

const { default: subscriptionRequirement, subscriptionRequirementPlans } = await import('../../src/runtime/server/requirements/subscription')

const user = { id: 7, email: 'member@example.com', name: 'Member' }
const check = (value: unknown) => subscriptionRequirement({ event: undefined, user, value })

describe('subscriptionRequirementPlans', () => {
  it('reads `*` as any plan, a plan key and a list of plan keys', () => {
    expect(subscriptionRequirementPlans('*')).toEqual([])
    expect(subscriptionRequirementPlans('member')).toEqual(['member'])
    expect(subscriptionRequirementPlans(['member', 'patron'])).toEqual(['member', 'patron'])
  })

  it('rejects anything else', () => {
    for (const value of [undefined, null, '', true, 1, [], [''], ['member', 2], { plan: 'member' }]) {
      expect(subscriptionRequirementPlans(value), JSON.stringify(value)).toBeNull()
    }
  })
})

describe('the subscription requirement', () => {
  beforeEach(() => {
    hasActiveSubscription.mockClear()
    hasActiveSubscription.mockResolvedValue(true)
  })

  it('asks for an entitled subscription on the named plans (any plan for `*`)', async () => {
    expect(await check('*')).toBe(true)
    expect(hasActiveSubscription).toHaveBeenLastCalledWith(7, { plans: [] })
    expect(await check(['member', 'patron'])).toBe(true)
    expect(hasActiveSubscription).toHaveBeenLastCalledWith(7, { plans: ['member', 'patron'] })
  })

  it('is not met without one', async () => {
    hasActiveSubscription.mockResolvedValue(false)
    expect(await check('member')).toBe(false)
  })

  it('is not met for an invalid value or user id, without looking anything up', async () => {
    expect(await check({ plan: 'member' })).toBe(false)
    expect(await subscriptionRequirement({ event: undefined, user: { ...user, id: 'abc' }, value: '*' })).toBe(false)
    expect(hasActiveSubscription).not.toHaveBeenCalled()
  })
})
