import { describe, expect, it } from 'vitest'
import { DASHBOARD_LIMITS, dashboardLayoutSchema } from '../../src/runtime/preferences'

const layout = (note: string) => ({ order: [], hidden: [], collapsed: [], settings: { notes: { note } } })
// The JSON around the note: {"notes":{"note":""}}
const overhead = JSON.stringify({ notes: { note: '' } }).length

describe('dashboard layout settings limit', () => {
  it('counts ASCII settings up to the limit', () => {
    expect(dashboardLayoutSchema.safeParse(layout('a'.repeat(DASHBOARD_LIMITS.settingsBytes - overhead))).success).toBe(true)
    expect(dashboardLayoutSchema.safeParse(layout('a'.repeat(DASHBOARD_LIMITS.settingsBytes - overhead + 1))).success).toBe(false)
  })

  it('counts bytes, not characters', () => {
    // 400 characters of "ø" are 800 bytes in UTF-8; 600 are 1200 bytes, past the limit though only 600 characters.
    expect(dashboardLayoutSchema.safeParse(layout('ø'.repeat(400))).success).toBe(true)
    expect(dashboardLayoutSchema.safeParse(layout('ø'.repeat(600))).success).toBe(false)
  })
})
