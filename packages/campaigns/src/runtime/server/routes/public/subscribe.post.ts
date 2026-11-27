import type { CampaignSubscribeResponse } from '../../../../types'
import { CAMPAIGNS_DEFAULT_PAGES } from '../../../utils'
import { campaignSlugParams, campaignSubscribeInput } from '../../../utils/schemas'

// `POST /api/campaigns/lists/:slug/subscribe` (anonymous): signs up for a public list, as JSON (the signup component, or
// another site through CORS) or as a plain HTML form. Rate limited per client and list; a captcha when the `captcha`
// option names one. The answer never depends on the address: a known one and an unknown one look the same. A plain form
// post is redirected (303) to the confirm page, which then says to check the inbox.
export default defineEventHandler(async (event): Promise<CampaignSubscribeResponse | undefined> => {
  const { slug } = await getValidatedRouterParams(event, campaignSlugParams.parse)
  await campaignsEnforceRateLimit(event, slug)
  const input = await readValidatedBody(event, campaignSubscribeInput.parse)
  const list = await getPublicCampaignListOr404(slug)
  await campaignsVerifyCaptcha(event, input.captcha ?? input['cf-turnstile-response'] ?? input['g-recaptcha-response'] ?? input['h-captcha-response'])

  // The honeypot: a person never fills it in, so a filled one gets the usual answer and nothing else.
  if (!input.website) {
    await campaignsSignup(event, list, {
      email: input.email,
      phone: input.phone,
      name: input.name,
      locale: input.locale,
      channels: input.channels,
    }, 'form')
  }

  const response: CampaignSubscribeResponse = { confirm: list.doubleOptIn }
  if ((getRequestHeader(event, 'content-type') ?? '').includes('application/x-www-form-urlencoded')) {
    const query = { subscribed: list.slug, ...(list.doubleOptIn ? { confirm: '1' } : {}) }
    const url = campaignsPageUrl(event, 'confirm', input.locale, query)
      ?? `${CAMPAIGNS_DEFAULT_PAGES.confirm}?${new URLSearchParams(query).toString()}`
    await sendRedirect(event, url, 303)
    return undefined
  }
  return response
})
