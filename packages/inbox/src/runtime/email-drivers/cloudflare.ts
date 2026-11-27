import { notFound } from '@frigear-nu/module-kit/server'
import { defineInboxEmailDriver } from '../utils'
import { parseAuthservIds } from '../utils/email-inbound'

// Cloudflare Email Routing: a domain's catch-all (or an address) routes to this Worker, and the `cloudflare-module`
// preset hands every email to the `cloudflare:email` hook, once per recipient (the envelope's `to`). The recipient is
// routed first (`inboxRouteRecipient`): an address nobody has is rejected with a bounce. The raw message is parsed
// (postal-mime), the sender is authenticated from the receiving server's `Authentication-Results` (authserv-id
// `inbox.cloudflare.authservIds`, `mx.cloudflare.net`), the files are stored (NuxtHub Blob) and the email is stored
// through this driver's own route in the same Worker (`inboxDeliverRawEmail`), so the inbox hooks get a request event
// like for any other driver. That route only takes a token that lives in this Worker's memory; from outside it is a 404.
//
// Nitro 2's preset runs the hook in `waitUntil` and returns at once, so Cloudflare accepts the email before the hook
// could reject it. The inbox installs a Worker entry that awaits the hook instead (`email.inbound.cloudflare`, see
// `module.ts`), so `setReject` works; when another entry replaces it, an unknown recipient is only logged.

/** What the `cloudflare:email` hook carries (Cloudflare's `ForwardableEmailMessage`), as far as the driver reads it. */
type CloudflareEmailMessage = {
  readonly from: string
  readonly to: string
  readonly raw: ReadableStream
  readonly rawSize: number
  setReject: (reason: string) => void
}
type CloudflareEmailHooks = { hook: (name: 'cloudflare:email', handler: (ctx: { message: CloudflareEmailMessage }) => Promise<void>) => unknown }

async function receive(message: CloudflareEmailMessage): Promise<void> {
  const route = await inboxRouteRecipient(message.to)
  if (route.kind !== 'account') {
    message.setReject('Unknown address')
    return
  }
  const raw = new Uint8Array(await new Response(message.raw).arrayBuffer())
  await inboxDeliverRawEmail({ driver: 'cloudflare', raw, recipients: [message.to], authservIds: parseAuthservIds(inboxConfig().cloudflare.authservIds) })
}

export default defineInboxEmailDriver({
  name: 'cloudflare',
  setup(nitroApp) {
    (nitroApp.hooks as unknown as CloudflareEmailHooks).hook('cloudflare:email', async ({ message }) => {
      try {
        await receive(message)
      }
      catch (error) {
        // The email was routed to a mailbox: a failure to store it is logged rather than bounced.
        console.error('[inbox] could not store an email from Cloudflare Email Routing', error)
      }
    })
  },
  async handler(event) {
    if (!(await inboxIsInternalEmailRequest(event))) throw notFound('This email driver has no webhook.')
    return inboxHandleInternalEmail(event)
  },
})
