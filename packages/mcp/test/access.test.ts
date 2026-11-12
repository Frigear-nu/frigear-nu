import { describe, expect, it, vi } from 'vitest'
import { SCOPED_META_KEY, filterMcpConfig, pick, permissionTags, redactPii } from '../src/runtime/utils/access'

describe('redaction', () => {
  const row = { id: 1, email: 'a@b.test', name: 'Ada' }

  it('removes identifying fields unless allowed', () => {
    expect(redactPii(row, { allow: false, fields: ['email', 'name'] })).toEqual({ id: 1 })
    expect(redactPii(row, { allow: true, fields: ['email', 'name'] })).toEqual(row)
  })

  it('picks an explicit allow-list so new columns never leak', () => {
    expect(pick({ ...row, passwordHash: 'x' }, ['id', 'name'])).toEqual({ id: 1, name: 'Ada' })
  })

  it('tags definitions with their permission', () => {
    expect(permissionTags({ permission: 'a:read' })).toEqual(['permission:a:read'])
  })
})

describe('filterMcpConfig', () => {
  const marked = { name: 'ok', _meta: { [SCOPED_META_KEY]: true } }

  it('keeps scoped definitions and drops the rest', () => {
    const config = { tools: [marked, { name: 'plain' }], resources: [{ _meta: {} }], prompts: [marked] }
    filterMcpConfig(config)
    expect(config.tools).toEqual([marked])
    expect(config.resources).toEqual([])
    expect(config.prompts).toEqual([marked])
  })

  it('tolerates a missing list instead of throwing', () => {
    const config = { tools: [marked, { name: 'plain' }] }
    filterMcpConfig(config)
    expect(config).toMatchObject({ tools: [marked], resources: [], prompts: [] })
  })

  it('empties every list when the filtering throws', () => {
    const throwing = {
      name: 'bad',
      get _meta(): never {
        throw new Error('boom')
      },
    }
    const config = { tools: [marked, throwing], resources: [marked], prompts: [marked] }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    filterMcpConfig(config)
    expect(config).toEqual({ tools: [], resources: [], prompts: [] })
  })
})
