import { z } from 'zod'
import type { AdminPaymentLinkResponse as PaymentLinkResponse } from '../../../../types'

const bodySchema = z.object({
  planKey: z.string().min(1).optional(),
  priceId: z.string().min(1).optional(),
  /** Also email the link to the user. */
  email: z.boolean().optional(),
}).refine(body => body.planKey || body.priceId, { message: 'Provide `planKey` or `priceId`.' })

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Staff creates a Stripe Checkout session for the user (same shape as the self-service checkout) and gets the
// URL back, optionally emailed to the user through @frigear-nu/notify. Checkout sessions expire after 24 hours.
export default defineEventHandler(async (event): Promise<PaymentLinkResponse> => {
  const { target } = await loadUsersAdminTarget(event, 'update')
  const body = await readValidatedBody(event, bodySchema.parse)
  const origin = getRequestURL(event).origin
  const pages = useRuntimeConfig().public.subscriptions?.pages ?? {}
  const stripe = useStripe()

  const current = currentEntitledRow(await listUserSubscriptionRows(target.id))
  if (current && current.source !== 'manual') {
    throw createError({ statusCode: 409, statusMessage: 'The user already has a paid subscription.' })
  }

  // Staff may pick any configured plan, so the per-request plan filter hook is not applied here.
  const { priceId, planKey } = await resolveCheckoutTarget(stripe, await getResolvedPlans(), body)

  const customer = await ensureStripeCustomer(target.id)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}${pages.success ?? pages.membership ?? '/'}`,
    cancel_url: `${origin}${pages.cancel ?? pages.membership ?? '/'}`,
    client_reference_id: String(target.id),
    subscription_data: { metadata: { userId: String(target.id), ...(planKey ? { planKey } : {}) } },
  })
  if (!session.url) throw createError({ statusCode: 502, statusMessage: 'Stripe did not return a checkout URL.' })

  let emailed = false
  if (body.email) {
    const plan = (useRuntimeConfig().subscriptions?.plans ?? {})[planKey ?? '']
    const label = plan?.label ?? planKey ?? 'membership'
    await dispatchEmailNotification({
      to: target.email,
      subject: `Complete your ${label} membership`,
      body: `<p>Hi ${escapeHtml(target.name)},</p><p>Use the link below to complete your ${escapeHtml(label)} membership. The link is valid for 24 hours.</p>`
        + `<p><a href="${escapeHtml(session.url)}">${escapeHtml(session.url)}</a></p>`,
      text: `Hi ${target.name},\n\nComplete your ${label} membership (valid for 24 hours): ${session.url}`,
    })
    emailed = true
  }
  return { url: session.url, emailed }
})
