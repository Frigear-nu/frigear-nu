import { createEvent } from 'h3'
import { createHooks } from 'hookable'
import type { NitroRuntimeHooks } from 'nitropack'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { isVisible } from '../src/index.ts'
import { resolveOwner, resolveViewer } from '../src/server.ts'
import type { AudienceOwnerContext, AudienceViewerContext } from '../src/server.ts'

function fakeEvent() {
  const req = new IncomingMessage(new Socket())
  return createEvent(req, new ServerResponse(req))
}

// The same hook type as `useNitroApp().hooks` in a Nitro app that imports `@frigear-nu/audience/server`.
function nitroHooks() {
  return createHooks<NitroRuntimeHooks>()
}

describe('hook types', () => {
  it('augments NitroRuntimeHooks', () => {
    const hooks = nitroHooks()
    hooks.hook('audience:viewer:resolve', (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<AudienceViewerContext>()
      expectTypeOf(ctx.user).toEqualTypeOf<{ id: string | number }>()
    })
    hooks.hook('audience:owner:resolve', (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<AudienceOwnerContext>()
    })
    expectTypeOf<Parameters<NitroRuntimeHooks['audience:owner:resolve']>[0]['label']>()
      .toEqualTypeOf<string | Record<string, string> | null>()
  })
})

describe('resolveViewer', () => {
  it('seeds global roles and lets listeners fill in the rest', async () => {
    const hooks = nitroHooks()
    hooks.hook('audience:viewer:resolve', ({ user, viewer }) => {
      expect(user).toEqual({ id: 7 })
      viewer.ladders.bar = ['volunteer', 'bartender', 'ba', 'coordinator']
      viewer.teamRoles.push({ ownerType: 'operation', ownerId: 'opr_roskilde', teamId: 'tem_1', kind: 'bar', role: 'ba', source: 'mapped' })
    })
    hooks.hook('audience:viewer:resolve', async ({ viewer }) => {
      viewer.operationIds.push('opr_roskilde')
    })

    const viewer = await resolveViewer(fakeEvent(), { hooks, user: { id: 7 }, globalRoles: ['barmanager'] })
    expect(viewer).toMatchObject({ userId: 7, globalRoles: ['barmanager'], operationIds: ['opr_roskilde'] })
    expect(isVisible({ operationId: 'opr_roskilde', minTeamRole: { kind: 'bar', role: 'ba' } }, viewer)).toBe(true)
  })

  it('treats an empty user id as anonymous', async () => {
    const hooks = nitroHooks()
    let called = false
    hooks.hook('audience:viewer:resolve', () => {
      called = true
    })
    const viewer = await resolveViewer(fakeEvent(), { hooks, user: { id: '' } })
    expect(called).toBe(false)
    expect(viewer.userId).toBeNull()
  })

  it('returns an anonymous viewer without calling the hook', async () => {
    const hooks = nitroHooks()
    let called = false
    hooks.hook('audience:viewer:resolve', () => {
      called = true
    })
    const viewer = await resolveViewer(fakeEvent(), { hooks, user: null, globalRoles: ['admin'] })
    expect(called).toBe(false)
    expect(viewer.userId).toBeNull()
    expect(viewer.globalRoles).toEqual([])
  })
})

describe('resolveOwner', () => {
  it('returns what the owning module answers', async () => {
    const hooks = nitroHooks()
    hooks.hook('audience:owner:resolve', (ctx) => {
      if (ctx.owner.type !== 'operation') return
      ctx.exists = ctx.owner.id === 'opr_roskilde'
      if (ctx.exists) ctx.label = { da: 'Roskilde 2027', en: 'Roskilde 2027' }
    })

    await expect(resolveOwner(fakeEvent(), { type: 'operation', id: 'opr_roskilde' }, { hooks }))
      .resolves.toEqual({ owner: { type: 'operation', id: 'opr_roskilde' }, label: { da: 'Roskilde 2027', en: 'Roskilde 2027' }, exists: true })
    await expect(resolveOwner(fakeEvent(), { type: 'operation', id: 'opr_gone' }, { hooks }))
      .resolves.toMatchObject({ label: null, exists: false })
  })

  it('leaves label and exists null when no module answers for the type', async () => {
    await expect(resolveOwner(fakeEvent(), { type: 'first-aid-post', id: 'x' }, { hooks: nitroHooks() }))
      .resolves.toEqual({ owner: { type: 'first-aid-post', id: 'x' }, label: null, exists: null })
  })
})
