const INVITE_TOKEN_PREFIX = 'cvt_'

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

/** SHA-256 of an invite token, base64url: what `crew_invites.tokenHash` stores. */
export async function crewHashToken(token: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))
}

/** A new random invite token (shown once), its hash and the first characters kept to recognise it. */
export async function crewGenerateToken() {
  const token = `${INVITE_TOKEN_PREFIX}${base64url(crypto.getRandomValues(new Uint8Array(32)))}`
  return { token, tokenHash: await crewHashToken(token), prefix: token.slice(0, INVITE_TOKEN_PREFIX.length + 4) }
}
