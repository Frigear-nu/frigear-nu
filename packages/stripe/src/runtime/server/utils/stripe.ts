import Stripe from 'stripe'
import { db, schema } from '@nuxthub/db'
import { and, eq, isNull } from 'drizzle-orm'

let cached: { key: string, apiVersion: string, client: Stripe } | undefined

/**
 * The shared Stripe SDK instance, configured from `runtimeConfig.stripe`. It uses the fetch HTTP
 * client, so it works on Cloudflare Workers as well as Node.
 */
export function useStripe(): Stripe {
  const { secretKey, apiVersion } = useRuntimeConfig().stripe

  if (!secretKey) {
    throw createError({ statusCode: 500, statusMessage: 'Stripe is not configured (missing `runtimeConfig.stripe.secretKey` / NUXT_STRIPE_SECRET_KEY).' })
  }

  if (!cached || cached.key !== secretKey || cached.apiVersion !== apiVersion) {
    cached = {
      key: secretKey,
      apiVersion,
      client: new Stripe(secretKey, {
        apiVersion: apiVersion as Stripe.StripeConfig['apiVersion'],
        httpClient: Stripe.createFetchHttpClient(),
      }),
    }
  }

  return cached.client
}

const escapeSearchValue = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')

/**
 * Returns the Stripe customer id for a user, creating (and persisting) one when needed. Lookup
 * order: `users.stripeCustomerId`, then a Stripe customer search by email, then a new customer.
 * Safe to call lazily from consumers - there is no login coupling.
 */
export async function ensureStripeCustomer(userId: number): Promise<string> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }
  if (user.stripeCustomerId) return user.stripeCustomerId

  const stripe = useStripe()

  const existing = await stripe.customers.search({
    query: `email:'${escapeSearchValue(user.email)}'`,
    limit: 1,
  })
  const customerId = existing.data[0]?.id
    ?? (await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId: String(user.id) },
    })).id

  // Guard against two concurrent calls: only the first writer wins, everyone returns the winner.
  const [updated] = await db.update(schema.users)
    .set({ stripeCustomerId: customerId })
    .where(and(eq(schema.users.id, userId), isNull(schema.users.stripeCustomerId)))
    .returning({ stripeCustomerId: schema.users.stripeCustomerId })
  if (updated?.stripeCustomerId) return updated.stripeCustomerId

  const [winner] = await db.select({ stripeCustomerId: schema.users.stripeCustomerId })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
  return winner?.stripeCustomerId ?? customerId
}

/** Resolves the local user owning a Stripe customer id, or `null` if none is linked. */
export async function getStripeCustomerUser(customerId: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.stripeCustomerId, customerId)).limit(1)
  return user ?? null
}
