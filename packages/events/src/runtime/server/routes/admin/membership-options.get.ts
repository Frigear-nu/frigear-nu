import type { MembershipOptionsDto } from '../../../../types'

// What staff can pick when restricting a ticket to (or excluding it for) members: empty and `available: false`
// when no membership provider is installed, in which case the admin UI hides the membership fields.
export default defineEventHandler(async (event): Promise<MembershipOptionsDto> => {
  await authorize(event, 'events:manage')
  const { available, options } = await getMembershipOptions()
  return { available, options: options.map(option => ({ value: option.value, label: option.label })) }
})
