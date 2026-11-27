// The Frigear ID API (`server/api/account/id-code*`). Plain types without imports, so other apps (apps/mobile) can copy
// this file as it is.

/** `GET /api/account/id-code` (session or `frigear-id:read`): the caller's own code, valid for `expiresIn` seconds. */
export type FrigearIdCode = {
  /** The signed code (a JWT). */
  idCode: string
  /** What the QR code holds: `urn:frigear:id:<idCode>`. */
  payload: string
  expiresIn: number
}

/** `POST /api/account/id-code/verify` with `{ code }` (`frigear-id:verify`): who the scanned code belongs to. */
export type FrigearIdVerification = {
  valid: true
  user: { id: string, name: string | null, avatar: string | null }
  /** Effective global roles, highest first, without `user`. `label` is the configured (English) label. */
  roles: { key: string, label: string }[]
  membership: {
    /** Whether the person holds an entitled membership now (`active` or `trialing`, not ended). */
    active: boolean
    planKey: string | null
    planLabel: string | null
    /** The status of the entitled subscription, or of the latest one when none is entitled. */
    status: string | null
    /** ISO date: the end of the current period. */
    validUntil: string | null
  }
  /** Approved crew and team places in operations that are not over (not wrapped up or archived, not past their end). */
  crew: { operation: { id: string, name: string }, team: { id: string, name: string }, role: { key: string, label: string } }[]
  /** ISO date. */
  verifiedAt: string
}
