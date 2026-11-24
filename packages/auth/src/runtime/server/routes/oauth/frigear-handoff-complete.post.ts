import { apiError, idParams } from '@frigear-nu/module-kit/server'

// `POST /api/auth/frigear/handoffs/:id/complete`: once the attempt is `complete`, starts this window's cookie session
// (the same session as every other sign-in) and answers `{ redirect }`. Single use: the attempt is consumed. 409
// `handoff_pending` while the browser has not come back, 409 `handoff_failed` (`data.error`) or 410 `handoff_expired`
// otherwise; those two also end the attempt.
export default defineEventHandler(async (event) => {
  assertAuthSameOrigin(event)
  const secret = requireFrigearHandoffSecret(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  await enforceFrigearHandoffPollLimit(event, id)
  const { row } = await requireFrigearHandoff(event, id)

  const status = frigearHandoffStatusOf(row)
  if (status === 'pending') throw apiError(409, 'handoff_pending', 'The sign-in in the browser is not finished yet.')
  if (status !== 'complete') {
    await removeFrigearHandoff(id, secret)
    clearFrigearHandoffCookie(event)
    if (status === 'expired') throw apiError(410, 'handoff_expired', 'The sign-in took too long. Start it again.')
    throw apiError(409, 'handoff_failed', 'The sign-in could not be completed.', { error: row.error })
  }

  const taken = await takeFrigearHandoff(id, secret)
  clearFrigearHandoffCookie(event)
  // Collected by a concurrent request in the meantime.
  if (!taken || taken.userId === null) throw apiError(410, 'handoff_expired', 'This sign-in was already used.')
  const user = await useAuthUserStore().findById(taken.userId)
  if (!user) throw apiError(410, 'handoff_expired', 'The account of this sign-in no longer exists.')

  await startAuthSession(event, user, taken.sessionData ?? {})
  return { redirect: isInternalPath(taken.redirectTo) ? taken.redirectTo : getAfterLoginPath(event) }
})
