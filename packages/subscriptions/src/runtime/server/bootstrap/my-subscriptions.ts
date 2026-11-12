import type { H3Event } from 'h3'
import type { MeResponse } from '../../../types'

/**
 * The caller's subscriptions: the body of `GET /api/subscriptions/me` and the account bootstrap's `subscriptions:me`
 * (the key `useSubscription()` reads), so both always return the same thing.
 */
export default async function mySubscriptions(event: H3Event): Promise<MeResponse> {
  const { user } = await authorize(event, 'subscriptions:read')
  return listUserSubscriptions(user.id)
}
