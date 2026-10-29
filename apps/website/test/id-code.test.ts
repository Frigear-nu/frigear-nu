import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { importSPKI, jwtVerify } from 'jose'
import { signIdCode } from '../server/utils/id-code'

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
