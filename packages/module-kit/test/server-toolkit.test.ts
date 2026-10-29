import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { createEvent } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import {
  apiError,
  badRequest,
  conflict,
  escapeLike,
  forbidden,
  idParams,
  intIdParams,
  isoDate,
  noContent,
  notConfigured,
  notFound,
  pageQuery,
  paginate,
  pageRange,
  likeContains,
  orderByQuery,
  resolveSameOriginUrl,
  sameOriginUrl,
  uniqueCopySlug,
  validationError,
  created,
} from '../src/runtime/server'
import { z } from 'zod'
import { SQLiteSyncDialect, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { PgDialect, pgTable, serial, text as pgText } from 'drizzle-orm/pg-core'

vi.mock('@nuxt/kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nuxt/kit')>()
  return { ...actual, addServerHandler: vi.fn() }
})

const makeEvent = (url = '/', host = 'example.test'): H3Event => {
  const req = new IncomingMessage(new Socket())
  req.url = url
  req.method = 'GET'
  req.headers = { host }
  return createEvent(req, new ServerResponse(req))
}

describe('errors', () => {
  it('builds createError with the message as statusMessage and the code in data', () => {
    const error = apiError(409, 'slug_taken', 'That slug is taken.', { field: 'slug' })
    expect(error.statusCode).toBe(409)
    expect(error.statusMessage).toBe('That slug is taken.')
    expect(error.data).toEqual({ code: 'slug_taken', field: 'slug' })
  })

  it('cannot have its code overridden by data', () => {
    expect(apiError(400, 'bad_request', 'x', { code: 'other' }).data).toEqual({ code: 'bad_request' })
  })

  it.each([
    [badRequest, 400, 'bad_request'],
    [forbidden, 403, 'forbidden'],
    [notFound, 404, 'not_found'],
    [conflict, 409, 'conflict'],
    [notConfigured, 501, 'not_configured'],
  ] as const)('%o answers %i %s', (helper, status, code) => {
    const error = helper('Message.')
    expect(error.statusCode).toBe(status)
    expect(error.statusMessage).toBe('Message.')
    expect(error.data).toMatchObject({ code })
  })

  it('has default messages', () => {
    expect(notFound().statusMessage).toBe('Not found.')
    expect(forbidden().statusMessage).toBe('You are not allowed to do that.')
  })

  it('puts validation issues in data.issues', () => {
    const issues = [{ path: ['name'], message: 'Required' }]
    const error = validationError(issues)
    expect(error.statusCode).toBe(400)
    expect(error.statusMessage).toBe('Validation Error')
    expect(error.data).toEqual({ code: 'validation_failed', issues })
  })
})

describe('params', () => {
  it('idParams accepts a non-empty string id under any name', () => {
    expect(idParams().parse({ id: 'evn_1' })).toEqual({ id: 'evn_1' })
    expect(idParams('tokenId').parse({ tokenId: 'tok' })).toEqual({ tokenId: 'tok' })
    expect(() => idParams().parse({ id: '' })).toThrow()
    expect(() => idParams().parse({ id: '  ' })).toThrow()
    expect(() => idParams().parse({})).toThrow()
  })

  it('intIdParams coerces a positive integer', () => {
    expect(intIdParams().parse({ id: '42' })).toEqual({ id: 42 })
    expect(intIdParams('userId').parse({ userId: '7' })).toEqual({ userId: 7 })
    for (const id of ['0', '-1', '1.5', 'abc']) expect(() => intIdParams().parse({ id })).toThrow()
  })
})

describe('pagination', () => {
  const schema = pageQuery({ sort: ['createdAt', 'name'], filters: { status: z.enum(['draft', 'published']).optional() } })

  it('applies the defaults', () => {
    expect(schema.parse({})).toEqual({ page: 1, pageSize: 20, sort: 'createdAt', order: 'desc' })
  })

  it('parses the useTableQuery vocabulary from query strings', () => {
    expect(schema.parse({ page: '3', pageSize: '50', q: ' party ', sort: 'name', order: 'asc', status: 'draft' }))
      .toEqual({ page: 3, pageSize: 50, q: 'party', sort: 'name', order: 'asc', status: 'draft' })
  })

  it('rejects out-of-range pages, unknown sorts and orders', () => {
    expect(() => schema.parse({ page: '0' })).toThrow()
    expect(() => schema.parse({ pageSize: '101' })).toThrow()
    expect(() => schema.parse({ sort: 'password' })).toThrow()
    expect(() => schema.parse({ order: 'sideways' })).toThrow()
    expect(() => schema.parse({ status: 'deleted' })).toThrow()
  })

  it('honours defaultSort, defaultOrder, defaultPageSize and maxPageSize', () => {
    const custom = pageQuery({ sort: ['id', 'name'], defaultSort: 'name', defaultOrder: 'asc', defaultPageSize: 10, maxPageSize: 25 })
    expect(custom.parse({})).toEqual({ page: 1, pageSize: 10, sort: 'name', order: 'asc' })
    expect(custom.parse({ pageSize: '25' }).pageSize).toBe(25)
    expect(() => custom.parse({ pageSize: '26' })).toThrow()
  })

  it('wraps a page and computes its range', () => {
    const query = schema.parse({ page: '2', pageSize: '10' })
    expect(pageRange(query)).toEqual({ limit: 10, offset: 10 })
    expect(paginate({ items: ['a'], total: 11, query })).toEqual({ items: ['a'], total: 11, page: 2, pageSize: 10 })
  })

  const things = sqliteTable('things', { id: integer().primaryKey(), name: text(), createdAt: integer() })
  const pgThings = pgTable('things', { id: serial().primaryKey(), name: pgText() })

  it('searches case-insensitively with escaped wildcards on both dialects', () => {
    const sqlite = new SQLiteSyncDialect().sqlToQuery(likeContains(things.name, '50%_Off'))
    expect(sqlite.sql).toBe('lower("things"."name") like lower(?) escape \'\\\'')
    expect(sqlite.params).toEqual(['%50\\%\\_Off%'])
    const pg = new PgDialect().sqlToQuery(likeContains(pgThings.name, 'Ada'))
    expect(pg.sql).toBe('lower("things"."name") like lower($1) escape \'\\\'')
  })

  it('orders by the query sort with an id tiebreaker', () => {
    const dialect = new SQLiteSyncDialect()
    const render = (parts: ReturnType<typeof orderByQuery>) => parts.map(part => dialect.sqlToQuery(part).sql)
    const columns = { name: things.name, createdAt: things.createdAt, id: things.id, role: undefined }
    expect(render(orderByQuery(columns, { sort: 'name', order: 'asc' }, { tiebreaker: things.id })))
      .toEqual(['"things"."name" asc', '"things"."id" desc'])
    expect(render(orderByQuery(columns, { sort: 'createdAt', order: 'desc' }, { tiebreaker: things.id })))
      .toEqual(['"things"."createdAt" desc', '"things"."id" desc'])
    // A missing column falls back to the tiebreaker; the tiebreaker is not repeated.
    expect(render(orderByQuery(columns, { sort: 'role', order: 'asc' }, { tiebreaker: things.id }))).toEqual(['"things"."id" desc'])
    expect(render(orderByQuery(columns, { sort: 'id', order: 'asc' }, { tiebreaker: things.id }))).toEqual(['"things"."id" asc'])
  })

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\')
  })
})

describe('respond', () => {
  it('sets 201 and 204', () => {
    const event = makeEvent()
    expect(created(event, { id: 1 })).toEqual({ id: 1 })
    expect(event.node.res.statusCode).toBe(201)
    expect(noContent(event)).toBeNull()
    expect(event.node.res.statusCode).toBe(204)
  })

  it('formats dates as ISO strings', () => {
    const date = new Date('2026-01-02T03:04:05.000Z')
    expect(isoDate(date)).toBe('2026-01-02T03:04:05.000Z')
    expect(isoDate(date.getTime())).toBe('2026-01-02T03:04:05.000Z')
    expect(isoDate(null)).toBeNull()
    expect(isoDate(undefined)).toBeNull()
  })
})

describe('helpers', () => {
  it('uniqueCopySlug finds the first free copy slug', async () => {
    const taken = new Set(['party-copy', 'party-copy-2'])
    expect(await uniqueCopySlug('party', async slug => taken.has(slug))).toBe('party-copy-3')
    expect(await uniqueCopySlug('fresh', async () => false)).toBe('fresh-copy')
    // Any truthy lookup result counts as taken.
    expect(await uniqueCopySlug('row', async slug => slug === 'row-copy' ? { id: 1 } : undefined)).toBe('row-copy-2')
  })

  it('sameOriginUrl only accepts paths and same-origin URLs', () => {
    const origin = 'https://example.test'
    expect(sameOriginUrl('/done', origin)).toBe('https://example.test/done')
    expect(sameOriginUrl('https://example.test/x?y=1', origin)).toBe('https://example.test/x?y=1')
    expect(sameOriginUrl('//evil.test/x', origin)).toBeNull()
    expect(sameOriginUrl('/\\evil.test', origin)).toBeNull()
    expect(sameOriginUrl('https://evil.test/x', origin)).toBeNull()
    expect(sameOriginUrl('not a url', origin)).toBeNull()
    // Normalised, so the string handed to Stripe is the one that was checked.
    expect(sameOriginUrl('HTTPS://EXAMPLE.test:443/a/../b', origin)).toBe('https://example.test/b')
    expect(sameOriginUrl('https://example.test', origin)).toBe('https://example.test/')
  })

  it('resolveSameOriginUrl falls back and throws 400 for other origins', () => {
    const event = makeEvent('/api/x', 'example.test')
    expect(resolveSameOriginUrl(event, undefined, { fallback: '/membership' })).toBe('http://example.test/membership')
    expect(resolveSameOriginUrl(event, undefined)).toBe('http://example.test/')
    expect(resolveSameOriginUrl(event, '/ok')).toBe('http://example.test/ok')
    expect(() => resolveSameOriginUrl(event, 'https://evil.test', { name: 'successUrl' })).toThrowError(/successUrl must be/)
    try {
      resolveSameOriginUrl(event, 'https://evil.test')
    }
    catch (error) {
      expect(error).toMatchObject({ statusCode: 400, data: { code: 'bad_request' } })
    }
  })
})

describe('addModuleRoutes', async () => {
  const { addServerHandler, createResolver } = await import('@nuxt/kit')
  const { addModuleRoutes, moduleRoutePath } = await import('../src/runtime/utils/server')

  it('joins paths onto base; absolute paths bypass it', () => {
    expect(moduleRoutePath('', '/api/admin/events')).toBe('/api/admin/events')
    expect(moduleRoutePath(':id', '/api/admin/events')).toBe('/api/admin/events/:id')
    expect(moduleRoutePath('/api/events/me/tickets', '/api/admin/events')).toBe('/api/events/me/tickets')
    expect(moduleRoutePath('things', '/')).toBe('/things')
    expect(moduleRoutePath('things/', '/api/my-module/')).toBe('/api/my-module/things')
  })

  it('registers one handler per route, resolved under runtime/server/routes', () => {
    const resolver = createResolver('file:///pkg/src/module.ts')
    addModuleRoutes(resolver, [
      { method: 'get', path: '', file: 'admin/events.get' },
      { method: 'patch', path: ':id', file: 'admin/event.patch' },
    ], { base: '/api/admin/events' })
    expect(vi.mocked(addServerHandler).mock.calls.map(([handler]) => handler)).toEqual([
      { route: '/api/admin/events', method: 'get', handler: '/pkg/src/runtime/server/routes/admin/events.get' },
      { route: '/api/admin/events/:id', method: 'patch', handler: '/pkg/src/runtime/server/routes/admin/event.patch' },
    ])
  })
})
