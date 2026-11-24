import { exportJWK, generateKeyPair, SignJWT } from 'jose'

// A fake frigear.nu for the browser handoff: one RS256 key, the codes it handed out and the exchanges it saw.
type IssuedCode = { clientId: string, redirectUri: string, challenge: string, nonce: string }

const keys = generateKeyPair('RS256')

export const fakeIssuerCodes = new Map<string, IssuedCode>()
export const fakeIssuerExchanges: Array<Record<string, string>> = []

export function fakeIssuerUrl(origin: string) {
  return `${origin}/api/test/issuer`
}

export async function fakeIssuerJwks() {
  const jwk = await exportJWK((await keys).publicKey)
  return { keys: [{ ...jwk, kid: 'test', alg: 'RS256', use: 'sig' }] }
}

export async function fakeIssuerIdToken(issuer: string, audience: string, nonce: string) {
  return new SignJWT({ email: 'grace@example.com', email_verified: true, name: 'Grace', nonce })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject('42')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign((await keys).privateKey)
}
