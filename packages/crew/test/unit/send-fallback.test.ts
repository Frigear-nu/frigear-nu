import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCrewStatusEmail } from '../../src/runtime/server/utils/crew-emails'
import { crewSend } from '../../src/runtime/server/utils/crew-send'

// Without `@frigear-nu/push` the status message is what crew always sent: the email through `dispatchEmailNotification`, as built
// (with `to`). `#crew/push` is the stand-in a build generates then.
vi.mock('#crew/push', () => ({ notifyUser: undefined, pushAvailable: false }))

const dispatchEmail = vi.fn()
vi.stubGlobal('dispatchEmailNotification', dispatchEmail)

const email = buildCrewStatusEmail({
  status: 'waitlisted',
  member: { email: 'ann@example.com', name: 'Ann', teamName: 'Orange bar', role: 'volunteer' },
  operationName: 'Roskilde',
  roleLabel: 'Volunteer',
  settings: undefined,
  locale: 'en',
})!

beforeEach(() => {
  vi.resetAllMocks()
  dispatchEmail.mockResolvedValue(undefined)
})

describe('crewSend without push', () => {
  it('dispatches the email as built', async () => {
    expect(await crewSend(undefined, 7, email)).toEqual(['email'])
    expect(dispatchEmail).toHaveBeenCalledWith(email)
    expect(dispatchEmail.mock.calls[0]![0]).toMatchObject({ to: 'ann@example.com', template: { name: 'crew-status-waitlisted' } })
  })

  it('lets a failing email reach the caller', async () => {
    dispatchEmail.mockRejectedValue(new Error('smtp down'))
    await expect(crewSend(undefined, 7, email)).rejects.toThrow('smtp down')
  })
})
