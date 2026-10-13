import { defineNitroPlugin } from 'nitropack/runtime'
import type { InvoicePaymentInput } from '../../../types'

// `@frigear-nu/subscriptions` announces invoices through this hook when `@frigear-nu/payments` is installed; without
// subscriptions it is never fired. The hook is not typed here so payments does not depend on the subscriptions package.
type InvoiceHook = (ctx: { invoice: InvoicePaymentInput }) => void | Promise<void>

export default defineNitroPlugin((nitroApp) => {
  const hooks = nitroApp.hooks as unknown as { hook: (name: string, fn: InvoiceHook) => void }
  hooks.hook('subscriptions:invoice', async ({ invoice }) => {
    await recordInvoicePayment(invoice)
  })
})
