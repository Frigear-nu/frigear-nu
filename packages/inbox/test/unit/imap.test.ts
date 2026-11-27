import net from 'node:net'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createImapSession, imapConnection, imapPoll, parseImapSettings } from '../../src/runtime/utils/imap'
import type { ImapSession } from '../../src/runtime/utils/imap'

const raw = (uid: number) => `Message-ID: <m${uid}@example.com>\r\nFrom: kari@example.com\r\nTo: support@example.org\r\nSubject: Hi ${uid}\r\n\r\nHello æøå ${uid}\r\n`

/** A fake session: a mailbox with these UIDs, recording what was fetched. */
function fakeSession(uids: number[], options: { uidValidity?: number, uidNext?: number, failOn?: number } = {}) {
  const fetched: string[] = []
  const session: ImapSession & { loggedOut: boolean } = {
    loggedOut: false,
    connect: vi.fn(async () => {}),
    mailboxOpen: vi.fn(async () => ({ uidValidity: BigInt(options.uidValidity ?? 7), uidNext: options.uidNext ?? Math.max(0, ...uids) + 1 })),
    search: vi.fn(async ({ uid }: { uid: string }) => {
      const from = Number(uid.split(':')[0])
      const matched = uids.filter(item => item >= from)
      // `n:*` matches the newest message even when its UID is below `n`.
      return matched.length ? matched : uids.slice(-1)
    }),
    fetchOne: vi.fn(async (uid: string) => {
      fetched.push(uid)
      if (Number(uid) === options.failOn) throw new Error('connection reset')
      return { source: new TextEncoder().encode(raw(Number(uid))) }
    }),
    logout: vi.fn(async () => {
      session.loggedOut = true
    }),
  }
  return { session, fetched }
}

describe('imapPoll', () => {
  it('takes nothing in the first time and starts after the newest message', async () => {
    const { session, fetched } = fakeSession([3, 5, 9])
    const deliver = vi.fn()
    expect(await imapPoll({ session, cursor: {}, deliver })).toEqual({ uidValidity: '7', lastUid: 9, delivered: 0, more: false })
    expect(fetched).toEqual([])
    expect(session.mailboxOpen).toHaveBeenCalledWith('INBOX', { readOnly: true })
    expect(session.loggedOut).toBe(true)
  })
  it('delivers the messages above the last UID, oldest first, and saves after each', async () => {
    const { session, fetched } = fakeSession([3, 5, 9, 12])
    const delivered: number[] = []
    const saved: unknown[] = []
    const result = await imapPoll({
      session,
      mailbox: 'Support',
      cursor: { uidValidity: '7', lastUid: 5 },
      deliver: async (bytes, uid) => {
        expect(new TextDecoder().decode(bytes)).toBe(raw(uid))
        delivered.push(uid)
      },
      save: async (cursor) => {
        saved.push(cursor)
      },
    })
    expect(delivered).toEqual([9, 12])
    expect(fetched).toEqual(['9', '12'])
    expect(saved).toEqual([{ uidValidity: '7', lastUid: 9 }, { uidValidity: '7', lastUid: 12 }])
    expect(result).toEqual({ uidValidity: '7', lastUid: 12, delivered: 2, more: false })
    expect(session.mailboxOpen).toHaveBeenCalledWith('Support', { readOnly: true })
  })
  it('takes nothing when the newest message is the last one seen (n:* matches it)', async () => {
    const { session, fetched } = fakeSession([3, 5])
    expect(await imapPoll({ session, cursor: { uidValidity: '7', lastUid: 5 }, deliver: vi.fn() })).toMatchObject({ lastUid: 5, delivered: 0 })
    expect(fetched).toEqual([])
  })
  it('stops at the limit and says there is more', async () => {
    const { session } = fakeSession([1, 2, 3, 4])
    expect(await imapPoll({ session, cursor: { uidValidity: '7', lastUid: 0 }, deliver: vi.fn(), limit: 2 })).toEqual({ uidValidity: '7', lastUid: 2, delivered: 2, more: true })
  })
  it('starts over when UIDVALIDITY changed', async () => {
    const { session, fetched } = fakeSession([1, 2], { uidValidity: 8 })
    expect(await imapPoll({ session, cursor: { uidValidity: '7', lastUid: 40 }, deliver: vi.fn() })).toEqual({ uidValidity: '8', lastUid: 2, delivered: 0, more: false })
    expect(fetched).toEqual([])
  })
  it('keeps what went in when one fails, and logs out', async () => {
    const { session } = fakeSession([1, 2, 3], { failOn: 3 })
    const saved: unknown[] = []
    await expect(imapPoll({ session, cursor: { uidValidity: '7', lastUid: 0 }, deliver: vi.fn(), save: async (cursor) => {
      saved.push(cursor)
    } })).rejects.toThrow('connection reset')
    expect(saved.at(-1)).toEqual({ uidValidity: '7', lastUid: 2 })
    expect(session.loggedOut).toBe(true)
  })
})

describe('parseImapSettings and imapConnection', () => {
  it('reads config.imap with defaults from the account', () => {
    const settings = parseImapSettings({ host: 'imap.example.org', authservIds: ['MX.Example.org', 3] })!
    expect(settings).toEqual({ host: 'imap.example.org', authservIds: ['mx.example.org'] })
    expect(imapConnection(settings, 'support@example.org', 'pw')).toEqual({ host: 'imap.example.org', port: 993, secure: true, user: 'support@example.org', password: 'pw' })
    expect(imapConnection({ host: 'h', secure: false, user: 'login' }, 'a@b.c', 'pw')).toMatchObject({ port: 143, secure: false, user: 'login' })
  })
  it('refuses settings without a valid host', () => {
    expect(parseImapSettings(undefined)).toBeNull()
    expect(parseImapSettings({ host: '' })).toBeNull()
    expect(parseImapSettings({ host: 'a b' })).toBeNull()
    expect(parseImapSettings('imap.example.org')).toBeNull()
  })
})

// The real client (imapflow) against a scripted IMAP server over TCP: what `inbox:imap` runs on Node.
describe('createImapSession against a scripted server', () => {
  const commands: string[] = []
  const uids = [4, 6]
  let server: net.Server
  let port: number

  beforeAll(async () => {
    server = net.createServer((socket) => {
      socket.write('* OK [CAPABILITY IMAP4rev1] scripted server ready\r\n')
      let buffer = ''
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8')
        let end
        while ((end = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          commands.push(line.replace(/^\S+ /, ''))
          const [tag, command = '', ...rest] = line.split(' ')
          const verb = command.toUpperCase()
          const args = rest.join(' ')
          if (verb === 'CAPABILITY') socket.write(`* CAPABILITY IMAP4rev1\r\n${tag} OK done\r\n`)
          else if (verb === 'LOGIN') socket.write(args === '"support@example.org" "secret"' || args === 'support@example.org secret' ? `${tag} OK logged in\r\n` : `${tag} NO [AUTHENTICATIONFAILED] bad\r\n`)
          else if (verb === 'NAMESPACE') socket.write(`* NAMESPACE (("" "/")) NIL NIL\r\n${tag} OK\r\n`)
          else if (verb === 'LIST') socket.write(`* LIST () "/" INBOX\r\n${tag} OK\r\n`)
          else if (verb === 'SELECT' || verb === 'EXAMINE') socket.write(`* ${uids.length} EXISTS\r\n* OK [UIDVALIDITY 42] v\r\n* OK [UIDNEXT 7] n\r\n${tag} OK [READ-ONLY] ${verb} done\r\n`)
          else if (verb === 'UID' && /^SEARCH/i.test(args)) {
            const from = Number(/UID (\d+):\*/i.exec(args)?.[1] ?? 1)
            const found = uids.filter(uid => uid >= from)
            socket.write(`* SEARCH ${(found.length ? found : uids.slice(-1)).join(' ')}\r\n${tag} OK\r\n`)
          }
          else if (verb === 'UID' && /^FETCH/i.test(args)) {
            const uid = Number(/^FETCH (\d+)/i.exec(args)?.[1])
            const body = raw(uid)
            socket.write(`* ${uids.indexOf(uid) + 1} FETCH (UID ${uid} BODY[] {${Buffer.byteLength(body)}}\r\n${body})\r\n${tag} OK\r\n`)
          }
          else if (verb === 'LOGOUT') {
            socket.write(`* BYE\r\n${tag} OK\r\n`)
            socket.end()
          }
          else socket.write(`${tag} OK\r\n`)
        }
      })
      socket.on('error', () => {})
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })
  afterAll(() => {
    server.close()
  })

  it('logs in, reads the new messages without marking them read, and logs out', async () => {
    const session = await createImapSession({ host: '127.0.0.1', port, secure: false, user: 'support@example.org', password: 'secret' })
    const delivered: string[] = []
    const result = await imapPoll({ session, cursor: { uidValidity: '42', lastUid: 4 }, deliver: async (bytes) => {
      delivered.push(new TextDecoder().decode(bytes))
    } })
    expect(result).toEqual({ uidValidity: '42', lastUid: 6, delivered: 1, more: false })
    expect(delivered).toEqual([raw(6)])
    expect(commands.some(command => /^EXAMINE/i.test(command))).toBe(true)
    expect(commands.some(command => /^UID FETCH 6 .*BODY\.PEEK\[\]/i.test(command))).toBe(true)
    expect(commands.some(command => /STORE/i.test(command))).toBe(false)
    expect(commands.at(-1)).toMatch(/^LOGOUT/i)
  })
  it('fails on a wrong password', async () => {
    const session = await createImapSession({ host: '127.0.0.1', port, secure: false, user: 'support@example.org', password: 'wrong' })
    await expect(imapPoll({ session, cursor: {}, deliver: vi.fn() })).rejects.toThrow()
  })
})
