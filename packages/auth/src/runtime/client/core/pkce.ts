export const base64url = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export const base64urlDecode = (value: string): string => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='))
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** A URL-safe random string of `byteLength` random bytes. */
export const randomString = (byteLength = 32) => base64url(crypto.getRandomValues(new Uint8Array(byteLength)))

/** RFC 7636 S256: `BASE64URL(SHA256(ASCII(code_verifier)))`. */
export async function challengeFor(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

/** A 64 character verifier (RFC 7636 §4.1 allows 43-128) and its S256 challenge. */
export async function createPkcePair() {
  const verifier = randomString(48)
  return { verifier, challenge: await challengeFor(verifier) }
}
