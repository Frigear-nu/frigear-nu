import { campaignTokenParams } from '../../../utils/schemas'

// A transparent 1x1 GIF.
const PIXEL = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), char => char.charCodeAt(0))

// `GET /api/campaigns/o/:token` (anonymous): the open pixel of a campaign email. Marks the delivery opened, once, when
// its campaign has `trackOpens`; answers the same image for any token, so it never tells whether one is valid.
export default defineEventHandler(async (event) => {
  const { token } = await getValidatedRouterParams(event, campaignTokenParams.parse)
  try {
    if (event.method === 'GET') await campaignsRecordOpen(event, token)
  }
  catch (error) {
    console.error('[campaigns] could not count an open', error)
  }
  setResponseHeaders(event, {
    'content-type': 'image/gif',
    'cache-control': 'no-store, max-age=0',
    'x-robots-tag': 'noindex, nofollow',
  })
  return PIXEL
})
