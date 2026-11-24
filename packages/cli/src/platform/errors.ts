export type PlatformErrorCode
  = | 'NO_WORKSPACE'
    | 'OUTSIDE_ROOT'
    | 'APP_EXISTS'
    | 'UNKNOWN_PLATFORM'
    | 'UNKNOWN_TEMPLATE'
    | 'UNKNOWN_TARGET'
    | 'APP_NOT_FOUND'
    | 'APP_AMBIGUOUS'
    | 'DOWNLOAD_FAILED'

/** An error of `addPlatform` / `initPlatform`; `candidates` lists the choices when one has to be picked. */
export class PlatformError extends Error {
  readonly code: PlatformErrorCode
  readonly candidates?: string[]

  constructor(code: PlatformErrorCode, message: string, options?: { candidates?: string[], cause?: unknown }) {
    super(message, { cause: options?.cause })
    this.name = 'PlatformError'
    this.code = code
    this.candidates = options?.candidates
  }
}
