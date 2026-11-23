import type { H3Event } from 'h3'
import { PUBLIC_GRANT_KIND, SIGNED_IN_GRANT_KIND } from '@frigear-nu/auth/grants'
import type { Grant } from '@frigear-nu/auth/grants'
import { validationError } from '@frigear-nu/module-kit/server'

/**
 * The owner id of a new mailbox: none for the platform; for a team, a team `teams:owner:resolve` knows (Teams answers
 * it), else 400.
 */
export async function inboxCheckMailboxOwner(event: H3Event, ownerType: 'platform' | 'team', ownerId: string | null): Promise<string | null> {
  if (ownerType === 'platform') {
    if (ownerId) throw validationError([{ path: ['ownerId'], message: 'A platform mailbox has no owner id.' }], 'Unknown owner')
    return null
  }
  if (!ownerId) throw validationError([{ path: ['ownerId'], message: 'Choose the team.' }], 'Unknown owner')
  const ctx = { event, owner: { type: 'team', id: ownerId }, label: null, exists: null as boolean | null }
  await useNitroApp().hooks.callHook('teams:owner:resolve', ctx)
  if (ctx.exists !== true) {
    throw validationError([{ path: ['ownerId'], message: ctx.exists === false ? 'This team does not exist.' : 'No installed module knows teams.' }], 'Unknown owner')
  }
  return ownerId
}

/**
 * Who reads a mailbox besides staff: its grants (`@frigear-nu/auth`), checked by their kinds. A mailbox holds outsiders'
 * messages, so a `public` grant and a `signed-in` grant (every user with an account) are refused, and a platform mailbox
 * must name who reads it (an empty list would be staff only, which is never what a platform mailbox is for). A team
 * mailbox may leave it empty: its leads read it.
 */
export async function inboxCheckMailboxGrants(event: H3Event, ownerType: string, value: readonly Grant[], stored?: unknown): Promise<Grant[]> {
  if (value.some(grant => grant.kind === PUBLIC_GRANT_KIND)) {
    throw validationError([{ path: ['grants'], message: 'A mailbox cannot be public.' }], 'Invalid grants')
  }
  if (value.some(grant => grant.kind === SIGNED_IN_GRANT_KIND)) {
    throw validationError([{ path: ['grants'], message: 'A mailbox cannot be open to every signed-in user: name the roles or teams that read it.' }], 'Invalid grants')
  }
  if (ownerType === 'platform' && !value.length) {
    throw validationError([{ path: ['grants'], message: 'Name the roles or teams that read this mailbox.' }], 'Invalid grants')
  }
  return grantsValidate(event, value, { stored })
}
