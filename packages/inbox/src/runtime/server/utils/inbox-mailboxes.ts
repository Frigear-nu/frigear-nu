import type { H3Event } from 'h3'
import { isEmptyVisibility } from '@frigear-nu/audience'
import type { Visibility } from '@frigear-nu/audience'
import { resolveOwner } from '@frigear-nu/audience/server'
import { validationError } from '@frigear-nu/module-kit/server'

/**
 * The owner id of a new mailbox: none for the platform; for a team, a team `audience:owner:resolve` knows (teams
 * answers it), else 400.
 */
export async function inboxCheckMailboxOwner(event: H3Event, ownerType: 'platform' | 'team', ownerId: string | null): Promise<string | null> {
  if (ownerType === 'platform') {
    if (ownerId) throw validationError([{ path: ['ownerId'], message: 'A platform mailbox has no owner id.' }], 'Unknown owner')
    return null
  }
  if (!ownerId) throw validationError([{ path: ['ownerId'], message: 'Choose the team.' }], 'Unknown owner')
  const resolved = await resolveOwner(event, { type: 'team', id: ownerId }, { hooks: useNitroApp().hooks })
  if (resolved.exists !== true) {
    throw validationError([{ path: ['ownerId'], message: resolved.exists === false ? 'This team does not exist.' : 'No installed module knows teams.' }], 'Unknown owner')
  }
  return ownerId
}

/**
 * A mailbox holds outsiders' messages, so it is never public, and a platform mailbox must name who reads it: an empty
 * visibility would mean "every signed-in user" in the audience rules. A team mailbox may leave it empty (its leads).
 */
export function inboxCheckMailboxVisibility(ownerType: string, visibility: Visibility | null): Visibility | null {
  if (visibility?.public) throw validationError([{ path: ['visibility', 'public'], message: 'A mailbox cannot be public.' }], 'Invalid visibility')
  if (ownerType === 'platform' && isEmptyVisibility(visibility)) {
    throw validationError([{ path: ['visibility'], message: 'Name the roles or team roles that read this mailbox.' }], 'Invalid visibility')
  }
  return isEmptyVisibility(visibility) ? null : visibility
}
