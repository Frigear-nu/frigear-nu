import { describe, expect, it } from 'vitest'
import {
  campaignAvailableActions,
  campaignContentLocales,
  campaignDuplicateBody,
  campaignFormBody,
  campaignFormSchema,
  campaignPermissions,
  campaignToForm,
  campaignTotals,
  emptyCampaignForm,
  fromLocalDateTimeInput,
  toLocalDateTimeInput,
} from '../../src/runtime/app/utils/admin-campaign'
import type { CampaignDto } from '../../src/types'

const t = (_key: string, fallback: string) => fallback

const campaign = (extra: Partial<CampaignDto> = {}): CampaignDto => ({
  id: 'cmp_1',
  kind: 'message',
  name: 'Gate change',
  channels: ['email', 'push'],
  audience: { userIds: ['3', '7'], grants: [{ kind: 'role', role: 'crew' }] },
  content: { email: { subject: { en: 'Moved', da: 'Flyttet' }, body: 'Gate **B**' }, push: { title: 'Moved', body: 'Gate B', url: '/gates' } },
  locale: 'en',
  trackClicks: true,
  trackOpens: false,
  important: false,
  status: 'draft',
  scheduledAt: null,
  startedAt: null,
  finishedAt: null,
  cancelledAt: null,
  createdBy: 1,
  sentBy: null,
  counts: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...extra,
})

describe('campaign permissions and actions', () => {
  const all = campaignPermissions(['campaigns:manage', 'campaigns:send', 'campaigns:send-important', 'campaigns:pii'])
  const manager = campaignPermissions(['campaigns:manage'])
  const sender = campaignPermissions(['campaigns:manage', 'campaigns:send'])

  it('reads the permission list', () => {
    expect(all).toEqual({ manage: true, send: true, sendImportant: true, pii: true })
    expect(campaignPermissions(['campaigns:*'])).toEqual({ manage: false, send: false, sendImportant: false, pii: false })
  })

  it('offers edit, send, schedule and delete on a draft only, by permission', () => {
    expect(campaignAvailableActions(campaign(), all)).toEqual({ edit: true, send: true, schedule: true, cancel: false, duplicate: true, remove: true })
    expect(campaignAvailableActions(campaign(), manager)).toEqual({ edit: true, send: false, schedule: false, cancel: false, duplicate: true, remove: true })
    expect(campaignAvailableActions(campaign({ status: 'sent' }), all)).toEqual({ edit: false, send: false, schedule: false, cancel: false, duplicate: true, remove: false })
  })

  it('offers cancel on a scheduled or sending campaign to senders', () => {
    for (const status of ['scheduled', 'sending'] as const) {
      expect(campaignAvailableActions(campaign({ status }), sender).cancel).toBe(true)
      expect(campaignAvailableActions(campaign({ status }), manager).cancel).toBe(false)
    }
    expect(campaignAvailableActions(campaign({ status: 'cancelled' }), all).cancel).toBe(false)
  })

  it('needs `send-important` to change, send or copy an important message, but not to delete or cancel it', () => {
    const important = campaign({ important: true })
    expect(campaignAvailableActions(important, sender)).toEqual({ edit: false, send: false, schedule: false, cancel: false, duplicate: false, remove: true })
    expect(campaignAvailableActions({ ...important, status: 'scheduled' }, sender).cancel).toBe(true)
    expect(campaignAvailableActions(important, all).send).toBe(true)
  })
})

describe('campaign form', () => {
  it('round-trips a campaign through the form', () => {
    const state = campaignToForm(campaign())
    expect(state.userIds).toEqual([3, 7])
    expect(campaignFormBody(state)).toEqual({
      name: 'Gate change',
      channels: ['email', 'push'],
      audience: { userIds: ['3', '7'], grants: [{ kind: 'role', role: 'crew' }] },
      content: { email: { subject: { en: 'Moved', da: 'Flyttet' }, body: 'Gate **B**' }, push: { title: 'Moved', body: 'Gate B', url: '/gates' } },
      trackClicks: true,
      trackOpens: false,
      important: false,
    })
  })

  it('keeps only the picked channels\' texts, drops empty ones and fits the audience to the kind', () => {
    const state = {
      ...emptyCampaignForm('newsletter'),
      name: '  Weekly  ',
      channels: ['email', 'push'] as const,
      listIds: ['cml_1'],
      userIds: [4],
      emailSubject: { en: 'Hi', da: '' },
      emailBody: '',
      smsBody: 'Unpicked',
      trackOpens: true,
      important: true,
    }
    expect(campaignFormBody({ ...state, channels: [...state.channels] })).toEqual({
      name: 'Weekly',
      channels: ['email'],
      audience: { listIds: ['cml_1'] },
      content: {},
      trackClicks: true,
      trackOpens: true,
      important: false,
    })
  })

  it('validates a channel\'s texts together, and allows an unfinished draft', () => {
    const schema = campaignFormSchema(t)
    expect(schema.safeParse({ ...emptyCampaignForm('message'), name: 'Draft' }).success).toBe(true)
    const half = schema.safeParse({ ...emptyCampaignForm('message'), name: 'Draft', emailSubject: 'Hello' })
    expect(half.success).toBe(false)
    expect(half.error?.issues.map(issue => issue.path.join('.'))).toEqual(['emailBody'])
    const push = schema.safeParse({ ...emptyCampaignForm('newsletter'), name: 'News', channels: ['push'] })
    expect(push.error?.issues.map(issue => issue.path.join('.'))).toEqual(['channels'])
    expect(schema.safeParse({ ...emptyCampaignForm('message'), name: ' ' }).success).toBe(false)
    expect(schema.safeParse({ ...emptyCampaignForm('message'), name: 'x', pushUrl: 'javascript:alert(1)' }).success).toBe(false)
  })

  it('copies a campaign as a new draft body', () => {
    const source = campaign({ status: 'sent', counts: { email: { total: 1, queued: 0, sent: 1, skipped: 0, failed: 0, opened: 0, clicked: 0, clicks: 0 } } })
    const body = campaignDuplicateBody(source, 'Gate change (copy)')
    expect(body).toMatchObject({ kind: 'message', name: 'Gate change (copy)', locale: 'en', important: false })
    expect(body).not.toHaveProperty('status')
    expect(body.audience).not.toBe(source.audience)
  })
})

describe('campaign numbers and dates', () => {
  it('adds up the counts of every channel', () => {
    expect(campaignTotals(null)).toBeNull()
    expect(campaignTotals({})).toBeNull()
    expect(campaignTotals({
      email: { total: 10, queued: 0, sent: 8, skipped: 1, failed: 1, opened: 4, clicked: 2, clicks: 3 },
      sms: { total: 5, queued: 1, sent: 4, skipped: 0, failed: 0, opened: 0, clicked: 1, clicks: 1 },
    })).toEqual({ total: 15, queued: 1, sent: 12, skipped: 1, failed: 1, opened: 4, clicked: 3, clicks: 4 })
  })

  it('lists the locales the texts are written in', () => {
    expect(campaignContentLocales(campaign().content)).toEqual(['da', 'en'])
    expect(campaignContentLocales({ sms: { body: 'one text' } })).toEqual([])
    expect(campaignContentLocales({ sms: { body: { en: 'x', de: ' ' } } })).toEqual(['en'])
  })

  it('converts between instants and datetime-local values', () => {
    const at = new Date(2026, 10, 27, 14, 30)
    expect(toLocalDateTimeInput(at)).toBe('2026-11-27T14:30')
    expect(fromLocalDateTimeInput('2026-11-27T14:30')?.getTime()).toBe(at.getTime())
    expect(toLocalDateTimeInput(null)).toBe('')
    expect(fromLocalDateTimeInput('')).toBeNull()
    expect(fromLocalDateTimeInput('nonsense')).toBeNull()
  })
})
