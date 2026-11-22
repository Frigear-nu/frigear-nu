import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Nuxt } from '@nuxt/schema'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addSessionUserFilter, sessionMapperContents } from '../../src/runtime/utils/build'
import type { SessionUserFilterRegistration } from '../../src/runtime/utils/build'

// `#auth/session-mapper`: the modules' session user filters, in registration order, then the host's mapper. The
// generated source is imported for real, with the filters and the mapper as files.
let dir: string
const file = async (name: string, source: string) => {
  const path = join(dir, name)
  await writeFile(path, source)
  return path
}
const load = async (name: string, filterPaths: string[], mapperPath?: string) => {
  const path = await file(name, sessionMapperContents(filterPaths, mapperPath))
  return (await import(pathToFileURL(path).href)).default as (user: Record<string, unknown>) => Record<string, unknown>
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'auth-session-mapper-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('sessionMapperContents', () => {
  it('passes the user through as it is without filters or a mapper', async () => {
    const map = await load('plain.mjs', [])
    expect(map({ id: 1, profile: { bio: 'x' } })).toEqual({ id: 1, profile: { bio: 'x' } })
  })

  it('runs the filters in order, then the host mapper on what they leave', async () => {
    const dropProfile = await file('drop-profile.mjs', 'export default ({ profile, ...user }) => ({ ...user, seen: [...(user.seen ?? []), \'drop-profile\'] })')
    const tag = await file('tag.mjs', 'export default user => ({ ...user, seen: [...(user.seen ?? []), \'tag\'] })')
    const mapper = await file('mapper.mjs', 'export default user => ({ id: user.id, seen: user.seen, hasProfile: \'profile\' in user })')
    const map = await load('composed.mjs', [dropProfile, tag], mapper)
    expect(map({ id: 7, profile: { bio: 'long' } })).toEqual({ id: 7, seen: ['drop-profile', 'tag'], hasProfile: false })
  })
})

describe('addSessionUserFilter', () => {
  it('registers each path once, in registration order', async () => {
    const listeners: Array<(filters: SessionUserFilterRegistration[]) => void> = []
    const nuxt = { hook: (_name: string, listener: (filters: SessionUserFilterRegistration[]) => void) => listeners.push(listener) } as unknown as Nuxt
    addSessionUserFilter(nuxt, '/a.mjs')
    addSessionUserFilter(nuxt, '/b.mjs')
    addSessionUserFilter(nuxt, '/a.mjs')
    const filters: SessionUserFilterRegistration[] = []
    for (const listener of listeners) listener(filters)
    expect(filters).toEqual([{ path: '/a.mjs' }, { path: '/b.mjs' }])
  })
})
