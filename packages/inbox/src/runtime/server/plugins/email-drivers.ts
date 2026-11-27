import { drivers } from '#inbox/email-drivers'

// Runs the `setup` of every inbound email driver once, with the Nitro app (the Cloudflare driver hooks
// `cloudflare:email` here). A driver that fails to set up is logged; the others still run.
export default defineNitroPlugin((nitroApp) => {
  for (const driver of Object.values(drivers)) {
    if (!driver.setup) continue
    try {
      driver.setup(nitroApp)
    }
    catch (error) {
      console.error(`[inbox] the email driver "${driver.name}" could not be set up`, error)
    }
  }
})
