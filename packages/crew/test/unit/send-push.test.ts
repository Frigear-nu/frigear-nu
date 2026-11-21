import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCrewStatusEmail } from '../../src/runtime/server/utils/crew-emails'
import { crewPushFromEmail, crewSend } from '../../src/runtime/server/utils/crew-send'

// With `@frigear-nu/push` installed the status message goes through `notifyUser` on the `crew.status` topic. `#crew/push` is the
// server module a build generates, mocked here as the installed one.
const notifyUser = vi.hoisted(() => vi.fn())
vi.mock('#crew/push', () => ({ notifyUser, pushAvailable: true }))

const dispatchEmail = vi.fn()
vi.stubGlobal('dispatchEmailNotification', dispatchEmail)

const email = buildCrewStatusEmail({
  status: 'approved',
  member: { email: 'ann@example.com', name: 'Ann', teamName: 'Orange bar', role: 'volunteer' },
  operationName: 'Summer Festival',
  roleLabel: 'Volunteer',
  settings: undefined,
  statusUrl: 'https://example.com/crew/status',
  locale: 'en',
})!

beforeEach(() => {
  vi.resetAllMocks()
})

describe('crewSend with push installed', () => {
  it('sends the status email through notifyUser without `to`, with a push to the status page', async () => {
    notifyUser.mockResolvedValue({ channels: ['email', 'push'], skipped: {} })

    expect(await crewSend(undefined, 7, email)).toEqual({ channels: ['email', 'push'], failed: [] })

    expect(notifyUser).toHaveBeenCalledTimes(1)
    const [, userId, input] = notifyUser.mock.calls[0]!
    expect(userId).toBe(7)
    expect(input.topic).toBe('crew.status')
    expect(input.email).toMatchObject({ subject: email.subject, template: { name: 'crew-status-approved' }, meta: { crewStatus: 'approved' } })
    expect(input.email).not.toHaveProperty('to')
    expect(input.sms).toBeUndefined()
    expect(input.push).toEqual({ title: email.subject, body: expect.stringContaining('Welcome to the crew'), url: 'https://example.com/crew/status' })
    expect(dispatchEmail).not.toHaveBeenCalled()
  })

  it('reports the attempted channels as failed when notifyUser throws, and does not throw', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    notifyUser.mockRejectedValue(new Error('unknown topic'))
    expect(await crewSend(undefined, 7, email)).toEqual({ channels: [], failed: ['email', 'push'] })
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('shortens a long message for the push', () => {
    const long = { ...email, template: { ...email.template!, props: { ...email.template!.props, message: 'x'.repeat(500) } } }
    expect(crewPushFromEmail(long).body).toHaveLength(200)
  })
})
