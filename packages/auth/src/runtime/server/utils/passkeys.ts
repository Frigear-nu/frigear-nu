import { isoDate } from '@frigear-nu/module-kit/server'
import type { AuthPasskeyDto } from '../../../types'

type PasskeyRow = {
  id: string
  name: string | null
  backedUp: boolean
  transports: string[] | null
  createdAt: Date | number | string
}

/** What the API returns about a passkey: never the public key, the counter or the owner. */
export function toPasskeyDto(row: PasskeyRow): AuthPasskeyDto {
  return {
    id: row.id,
    name: row.name,
    backedUp: row.backedUp,
    transports: row.transports,
    createdAt: isoDate(row.createdAt),
  }
}
