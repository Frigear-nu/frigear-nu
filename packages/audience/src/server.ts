import type { H3Event } from 'h3'
import type { OwnerLabel, OwnerRef, Viewer } from './types.ts'
import { createViewer } from './visibility.ts'

/** The signed-in user a viewer is resolved for, or `null` for an anonymous visitor. */
export interface AudienceUser {
  id: string | number
}

/**
 * Context of `audience:viewer:resolve`. The calling module seeds `viewer.globalRoles`; listeners add to
 * `viewer.teamRoles`, `viewer.ladders` and `viewer.operationIds`. Identify the user from `ctx.user`, never from the
 * session on `ctx.event`: it is empty for bearer requests.
 */
export interface AudienceViewerContext {
  event: H3Event
  /** Always a signed-in user: the hook is never called for anonymous visitors. */
  user: AudienceUser
  viewer: Viewer
}

/**
 * Context of `audience:owner:resolve`. The module that owns `owner.type` sets `label` and `exists`; both stay `null`
 * when no module answers for that type.
 */
export interface AudienceOwnerContext {
  event: H3Event
  owner: OwnerRef
  label: OwnerLabel | null
  exists: boolean | null
}

/** The Nitro runtime hooks of the audience contract. */
export interface AudienceRuntimeHooks {
  /** Fill in who is looking: teams adds team roles and ladders, operations and crew add operation ids. */
  'audience:viewer:resolve': (ctx: AudienceViewerContext) => void | Promise<void>
  /** The owning module (operations for `operation`, teams for `team`) sets the owner's label and whether it exists. */
  'audience:owner:resolve': (ctx: AudienceOwnerContext) => void | Promise<void>
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Fill in who is looking: teams adds team roles and ladders, operations and crew add operation ids. */
    'audience:viewer:resolve': (ctx: AudienceViewerContext) => void | Promise<void>
    /** The owning module (operations for `operation`, teams for `team`) sets the owner's label and whether it exists. */
    'audience:owner:resolve': (ctx: AudienceOwnerContext) => void | Promise<void>
  }
}

/**
 * What calls the hooks: pass `useNitroApp().hooks`. The package takes it as an argument because a framework-free
 * package cannot import Nitro's runtime outside a Nitro build.
 */
export interface AudienceHookCaller {
  callHook(name: 'audience:viewer:resolve', ctx: AudienceViewerContext): unknown
  callHook(name: 'audience:owner:resolve', ctx: AudienceOwnerContext): unknown
}

export interface ResolveViewerOptions {
  /** `useNitroApp().hooks`. */
  hooks: AudienceHookCaller
  /** The signed-in user, or `null` for an anonymous visitor. */
  user: AudienceUser | null
  /** The user's global roles, for example from auth's `getEffectiveRoles`. */
  globalRoles?: string[]
}

/**
 * Builds the {@link Viewer} for a request: seeds `userId` and `globalRoles`, then calls `audience:viewer:resolve` so
 * teams, operations and crew can fill in the rest. An anonymous visitor gets an empty viewer without calling the hook.
 */
export async function resolveViewer(event: H3Event, options: ResolveViewerOptions): Promise<Viewer> {
  const { hooks, user } = options
  if (!user || user.id === '') return createViewer()
  const ctx: AudienceViewerContext = {
    event,
    user,
    viewer: createViewer({ userId: user.id, globalRoles: [...(options.globalRoles ?? [])] }),
  }
  await hooks.callHook('audience:viewer:resolve', ctx)
  return ctx.viewer
}

export interface ResolvedOwner {
  owner: OwnerRef
  /** The owner's label, or `null` when no module answers for this owner type. */
  label: OwnerLabel | null
  /** `true` or `false` from the owning module, `null` when no module answers for this owner type. */
  exists: boolean | null
}

/**
 * Looks up an owner's label and whether it exists, through `audience:owner:resolve`, without importing the owning
 * module. It answers nothing about access: check that with `authorize(event, permission, record)`.
 */
export async function resolveOwner(
  event: H3Event,
  owner: OwnerRef,
  options: { hooks: AudienceHookCaller },
): Promise<ResolvedOwner> {
  const ctx: AudienceOwnerContext = { event, owner: { ...owner }, label: null, exists: null }
  await options.hooks.callHook('audience:owner:resolve', ctx)
  return { owner: ctx.owner, label: ctx.label, exists: ctx.exists }
}

export type { OwnerLabel, OwnerRef, OwnerType, TeamRoleGrant, Viewer } from './types.ts'
