export type FrigearColorMode = 'light' | 'dark' | 'system'

/** The optional `color_mode` claim; anything that is not a known mode is ignored. */
export function parseColorModeClaim(value: unknown): FrigearColorMode | undefined {
  return value === 'light' || value === 'dark' || value === 'system' ? value : undefined
}
