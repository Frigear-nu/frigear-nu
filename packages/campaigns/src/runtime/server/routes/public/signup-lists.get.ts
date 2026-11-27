import type { CampaignSignupListDto } from '../../../../types'

// `GET /api/campaigns/signup/lists` (anonymous): the lists the registration form offers, each an unticked box with its
// consent text. Only public lists with `signupMode: 'offer'` that use email.
export default defineEventHandler(async (): Promise<CampaignSignupListDto[]> => {
  return (await campaignsSignupLists()).map(toCampaignSignupListDto)
})
