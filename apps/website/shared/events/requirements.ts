import type { EventsCollectionItem } from '@nuxt/content'

type Requirement = EventsCollectionItem['tickets'][string]['requirements'][number]

type CheckResult = {
  requirement: Requirement
  pass: boolean
}

export const checkTicketRequirements = (
  ticket: EventsCollectionItem['tickets'][string],
  userMemberships: { priceId: string }[],
) => {
  const checks = [...ticket?.requirements || []].map((requirement: EventsCollectionItem['tickets'][string]['requirements'][number]) => {
    if (requirement.type === 'membership') {
      const { pass } = checkTicketMembershipRequirement(requirement, userMemberships)
      return {
        requirement,
        pass,
      }
    }

    return {
      requirement,
      pass: true,
    }
  })

  const passedChecks = checks.filter(check => check.pass)
  const failedChecks = checks.filter(check => !check.pass)

  return {
    failed: failedChecks,
    passed: passedChecks,
    success: passedChecks.length === checks.length,
  }
}

export const checkTicketMembershipRequirement = (
  requirement: Requirement,
  userMemberships: { priceId: string }[],
): CheckResult => {
  return {
    requirement,
    pass: userMemberships.some((m) => {
      if (requirement.method === 'any') {
        return userMemberships.length > 0
      }

      if (requirement.method === 'one_of') {
        return requirement.priceIds.includes(m.priceId)
      }

      return true
    }),
  }
}

export const getEventRequirementIcon = () => {

}
