import { describe, expect, it } from 'vitest'
import { buildInboxRegistry } from '../../src/runtime/utils/registry'
import { defineInboxChannel, extendInbox } from '../../src/runtime/utils'
import type { InboxChannelDefinition } from '../../src/types'

const channel = (id: string, adapter = `/abs/${id}.ts`): InboxChannelDefinition => ({ id, label: id, adapter })

describe('channel registry', () => {
  it('merges registrations in order: a later one with the same id replaces the earlier', () => {
    const { registry, issues } = buildInboxRegistry([
      { channels: [channel('email'), channel('whatsapp')] },
      { channels: [{ id: 'acme.sms', label: { da: 'SMS', en: 'Text' }, icon: 'i-lucide-message-square', adapter: '/abs/sms.ts' }] },
      { channels: [channel('email', '/host/email.ts')] },
    ])
    expect(issues).toEqual([])
    expect(Object.keys(registry.channels)).toEqual(['email', 'whatsapp', 'acme.sms'])
    expect(registry.adapters.email).toBe('/host/email.ts')
    expect(registry.channels['acme.sms']).toEqual({ id: 'acme.sms', label: { da: 'SMS', en: 'Text' }, icon: 'i-lucide-message-square' })
  })

  it('reports invalid ids, labels and adapters instead of registering them', () => {
    const { registry, issues } = buildInboxRegistry([{
      channels: [
        channel('Bad Id'),
        { id: 'nolabel', label: '', adapter: '/x.ts' },
        { id: 'noadapter', label: 'No adapter', adapter: '' },
        channel('ok'),
      ],
    }])
    expect(issues).toHaveLength(3)
    expect(Object.keys(registry.channels)).toEqual(['ok'])
  })

  it('collects extendInbox calls on the nuxt options, unless the host turned the inbox off', () => {
    const nuxt = { options: {} } as Parameters<typeof extendInbox>[0]
    extendInbox(nuxt, { channels: [channel('a')] })
    extendInbox(nuxt, { channels: [channel('b')] })
    expect((nuxt.options as unknown as { inbox: { _extensions: unknown[] } }).inbox._extensions).toHaveLength(2)

    const off = { options: { inbox: false } } as unknown as Parameters<typeof extendInbox>[0]
    extendInbox(off, { channels: [channel('a')] })
    expect((off.options as unknown as { inbox: unknown }).inbox).toBe(false)
  })

  it('defineInboxChannel returns the adapter as written', () => {
    const adapter = { id: 'x', send: () => ({ externalId: '1' }) }
    expect(defineInboxChannel(adapter)).toBe(adapter)
  })
})
