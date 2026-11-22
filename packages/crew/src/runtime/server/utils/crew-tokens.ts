import { randomToken, sha256Base64Url } from '@frigear-nu/module-kit/server'

const INVITE_TOKEN_PREFIX = 'cvt_'

/** SHA-256 of an invite token, base64url: what `crew_invites.tokenHash` stores. */
export async function crewHashToken(token: string): Promise<string> {
  return sha256Base64Url(token)
}

/** A new random invite token (shown once), its hash and the first characters kept to recognise it. */
export async function crewGenerateToken() {
  const token = `${INVITE_TOKEN_PREFIX}${randomToken(32)}`
  return { token, tokenHash: await crewHashToken(token), prefix: token.slice(0, INVITE_TOKEN_PREFIX.length + 4) }
}
