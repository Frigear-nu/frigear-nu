import { describe, expect, it } from 'vitest'
import { buildCrewStatusEmail } from '../../src/runtime/server/utils/crew-emails'
import { CREW_STATUSES } from '../../src/runtime/utils/status'

const member = { email: 'ada@example.com', name: 'Ada <Lovelace>', teamName: { en: 'Bar A', da: 'Bar A' }, role: 'volunteer' }
const base = { member, operationName: { en: 'Roskilde 2027', da: 'Roskilde 2027' }, roleLabel: 'Volunteer', settings: undefined }

describe('crew status emails', () => {
  it('builds a built-in email for every status, from the crew-status-<status> template', () => {
    for (const status of CREW_STATUSES) {
      const email = buildCrewStatusEmail({ ...base, status })
      expect(email, status).not.toBeNull()
      expect(email!.to).toBe('ada@example.com')
      expect(email!.template).toMatchObject({ name: `crew-status-${status}`, locale: 'en', props: { operationName: 'Roskilde 2027', teamName: 'Bar A', role: 'Volunteer' } })
      expect(email!.subject).toContain('Roskilde 2027')
      expect(email!.subject).not.toContain('{{')
      expect(email!.body).not.toContain('{{')
    }
  })

  it('escapes the person\'s name in the html body but not in the plain text', () => {
    const email = buildCrewStatusEmail({ ...base, status: 'approved' })!
    expect(email.body).toContain('Hi Ada &lt;Lovelace&gt;,')
    expect(email.text).toContain('Hi Ada <Lovelace>,')
    expect(email.text).toContain('Bar A')
  })

  it('uses the operation\'s own subject and message, filling the variables, in the locale asked for', () => {
    const email = buildCrewStatusEmail({
      ...base,
      status: 'approved',
      locale: 'da',
      settings: { statusEmails: { approved: { subject: { en: 'Welcome {{name}}', da: 'Velkommen til {{operation}}, {{ name }}' }, body: { da: 'Du er {{role}} på {{team}}.\n\nVi ses!' } } } },
    })!
    expect(email.subject).toBe('Velkommen til Roskilde 2027, Ada <Lovelace>')
    expect(email.text).toContain('Du er Volunteer på Bar A.')
    expect(email.body).toContain('<p>Du er Volunteer på Bar A.</p><p>Vi ses!</p>')
    expect(email.template?.props).toMatchObject({ subject: email.subject, message: 'Du er Volunteer på Bar A.\n\nVi ses!' })
  })

  it('sends nothing for a status that is turned off, or to a person without an email', () => {
    expect(buildCrewStatusEmail({ ...base, status: 'rejected', settings: { statusEmails: { rejected: { enabled: false } } } })).toBeNull()
    expect(buildCrewStatusEmail({ ...base, status: 'approved', member: { ...member, email: null as unknown as string } })).toBeNull()
    // Turning one status off leaves the others alone.
    expect(buildCrewStatusEmail({ ...base, status: 'approved', settings: { statusEmails: { rejected: { enabled: false } } } })).not.toBeNull()
  })

  it('links to the status page when it is turned on', () => {
    const email = buildCrewStatusEmail({ ...base, status: 'applied', statusUrl: 'https://example.com/crew/status' })!
    expect(email.body).toContain('href="https://example.com/crew/status"')
    expect(email.template?.props?.statusUrl).toBe('https://example.com/crew/status')
    expect(buildCrewStatusEmail({ ...base, status: 'applied' })!.template?.props?.statusUrl).toBeNull()
  })
})
