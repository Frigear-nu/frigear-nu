import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SignJWT, importPKCS8, importSPKI, jwtVerify } from 'jose'
import { signIdCode, verifyIdCode } from '../server/utils/id-code'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

describe('signIdCode', () => {
  it('fails with 501 not_configured when no signing key is set', async () => {
    await expect(signIdCode({}, 1, 'https://frigear.test')).rejects.toMatchObject({
      statusCode: 501,
      data: { code: 'not_configured' },
    })
  })

  it('signs a 60 second code with the oauth-server key, verifiable against its public key', async () => {
    // The key arrives from an env var with escaped newlines.
    const config = { oauthServer: { privateKey: privateKey.replaceAll('\n', '\\n'), keyId: 'k1', issuer: 'https://id.test' } }
    const result = await signIdCode(config, 7, 'https://frigear.test')
    expect(result.expiresIn).toBe(60)
    expect(result.payload).toBe(`urn:frigear:id:${result.idCode}`)

    const { payload, protectedHeader } = await jwtVerify(result.idCode, await importSPKI(publicKey, 'RS256'), {
      issuer: 'https://id.test',
      audience: 'frigear:id',
    })
    expect(protectedHeader.kid).toBe('k1')
    expect(payload.sub).toBe('7')
    expect(payload.typ).toBe('frigear:id')
    expect(payload.exp! - payload.iat!).toBe(60)
  })

  it('prefers the account override and falls back to the request origin as issuer', async () => {
    const result = await signIdCode({ account: { idCode: { privateKey } } }, 'u1', 'https://frigear.test')
    const { payload, protectedHeader } = await jwtVerify(result.idCode, await importSPKI(publicKey, 'RS256'))
    expect(payload.iss).toBe('https://frigear.test')
    expect(protectedHeader.kid).toBe('key-1')
  })
})

describe('verifyIdCode', () => {
  const config = { oauthServer: { privateKey, keyId: 'k1', issuer: 'https://id.test' } }
  const origin = 'https://frigear.test'

  /** A code signed with `key`, with `claims` and `audience` overriding a valid Frigear ID's. */
  async function forge(options: { key?: string, claims?: Record<string, unknown>, audience?: string, issuer?: string, expiresIn?: string } = {}) {
    return new SignJWT({ typ: 'frigear:id', ...options.claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(options.issuer ?? 'https://id.test')
      .setSubject('7')
      .setAudience(options.audience ?? 'frigear:id')
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '60s')
      .sign(await importPKCS8(options.key ?? privateKey, 'RS256'))
  }

  it('verifies what signIdCode signs, from the QR payload or the bare JWT', async () => {
    const signed = await signIdCode(config, 7, origin)
    await expect(verifyIdCode(config, signed.payload, origin)).resolves.toMatchObject({ userId: '7' })
    const verified = await verifyIdCode(config, signed.idCode, origin)
    expect(verified.userId).toBe('7')
    expect(verified.expiresAt - verified.issuedAt!).toBe(60)
  })

  it('verifies with a configured public key', async () => {
    const signed = await signIdCode(config, 7, origin)
    const withPublic = { oauthServer: { ...config.oauthServer, publicKey } }
    await expect(verifyIdCode(withPublic, signed.payload, origin)).resolves.toMatchObject({ userId: '7' })
  })

  it('rejects a tampered code with 400 invalid_code', async () => {
    const { idCode } = await signIdCode(config, 7, origin)
    const [header, , signature] = idCode.split('.')
    const payload = Buffer.from(JSON.stringify({ typ: 'frigear:id', sub: '1', aud: 'frigear:id', iss: 'https://id.test', exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url')
    await expect(verifyIdCode(config, `${header}.${payload}.${signature}`, origin)).rejects.toMatchObject({ statusCode: 400, data: { code: 'invalid_code' } })
  })

  it('rejects a code signed by another key, malformed input and other token types with 400 invalid_code', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
    for (const code of [
      await forge({ key: other.privateKey }),
      await forge({ claims: { typ: 'access_token' } }),
      await forge({ issuer: 'https://elsewhere.test' }),
      'urn:frigear:id:not-a-jwt',
      'a.b.c',
      '',
    ]) {
      await expect(verifyIdCode(config, code, origin)).rejects.toMatchObject({ statusCode: 400, data: { code: 'invalid_code' } })
    }
  })

  it('rejects the wrong audience with 400 invalid_code', async () => {
    await expect(verifyIdCode(config, await forge({ audience: 'frigear:sso' }), origin)).rejects.toMatchObject({ statusCode: 400, data: { code: 'invalid_code' } })
  })

  it('rejects an expired code with 410 expired, within a few seconds of tolerance', async () => {
    const { idCode } = await signIdCode(config, 7, origin)
    const inSeconds = (seconds: number) => new Date(Date.now() + seconds * 1000)
    await expect(verifyIdCode(config, idCode, origin, { currentDate: inSeconds(62) })).resolves.toMatchObject({ userId: '7' })
    await expect(verifyIdCode(config, idCode, origin, { currentDate: inSeconds(90) })).rejects.toMatchObject({ statusCode: 410, data: { code: 'expired' } })
  })

  it('fails with 501 not_configured when no key is set', async () => {
    await expect(verifyIdCode({}, 'a.b.c', origin)).rejects.toMatchObject({ statusCode: 501, data: { code: 'not_configured' } })
  })
})
