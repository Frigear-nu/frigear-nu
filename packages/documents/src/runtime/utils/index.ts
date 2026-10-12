export * from './access'

/** `prefix_` + random id, e.g. `doc_3f2a...`. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}

/** Default accepted upload types. */
export const DEFAULT_ACCEPT = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'image/*',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

/** True when `type` equals an entry of `accept` or falls under one of its `type/*` wildcards. */
export function isAccepted(type: string, accept: string[]): boolean {
  const normalized = type.toLowerCase().split(';')[0]!.trim()
  return accept.some(entry => entry.endsWith('/*')
    ? normalized.startsWith(entry.slice(0, -1))
    : normalized === entry.toLowerCase())
}

/** A name that is safe in a blob pathname and a download header. */
export const safeFilename = (name: string) => name.replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file'
