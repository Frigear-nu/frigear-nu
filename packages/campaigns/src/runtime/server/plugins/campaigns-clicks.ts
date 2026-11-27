import type { NitroApp } from 'nitropack'

type ClickedContext = { link: { id: string, owner: { module: string, refId?: string | null } }, subject: string | null }

// Attributes clicks on the short links of campaign messages: `@frigear-nu/short-links` fires `short-links:clicked`, the
// subject is the delivery token, and the delivery gets `clickedAt`, its click count and a `campaign_clicks` row.
export default defineNitroPlugin((nitroApp: NitroApp) => {
  const hooks = nitroApp.hooks as unknown as { hook: (name: string, fn: (ctx: ClickedContext) => Promise<void>) => void }
  hooks.hook('short-links:clicked', async (ctx) => {
    try {
      await campaignsRecordClick(ctx.link, ctx.subject)
    }
    catch (error) {
      console.error('[campaigns] could not count a click', error)
    }
  })
})
