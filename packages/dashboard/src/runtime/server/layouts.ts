import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { notFound, validationError } from '@frigear-nu/module-kit/server'
import { DASHBOARD_LAYOUTS_KEY, DASHBOARD_LIMITS } from '../preferences'
import { mergeDashboardLayouts, validDashboardLayouts } from '../shared/stored-layouts'
import type { DashboardLayouts } from '../shared/stored-layouts'
import type { DashboardLayout } from '../../types'

// The `dashboardLayouts` preference on `users.preferences` (Preferences' column). It is `managed`, so it is never in
// the session cookie and only these helpers (behind `/api/dashboard/me/layouts`) read and write it.

async function storedPreferences(userId: number) {
  const [row] = await db.select({ preferences: schema.users.preferences }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  return row as { preferences: Record<string, unknown> | null } | undefined
}

/** A user's valid layouts; an invalid stored layout is left out. */
export async function readDashboardLayouts(userId: number): Promise<DashboardLayouts> {
  const row = await storedPreferences(userId)
  return validDashboardLayouts(row?.preferences?.[DASHBOARD_LAYOUTS_KEY])
}

/**
 * Replaces (or removes, with `null`) the named layouts of a user and keeps the others, merged against a read made right
 * before the write. Invalid stored layouts are dropped, never written back. Answers the stored layouts.
 */
export async function saveDashboardLayouts(userId: number, change: Record<string, DashboardLayout | null>): Promise<DashboardLayouts> {
  const row = await storedPreferences(userId)
  if (!row) throw notFound('User not found.')
  const next = mergeDashboardLayouts(validDashboardLayouts(row.preferences?.[DASHBOARD_LAYOUTS_KEY]), change)
  if (!next) {
    throw validationError([{ code: 'custom', path: ['layouts'], message: `At most ${DASHBOARD_LIMITS.dashboards} dashboard layouts.` }])
  }
  const { [DASHBOARD_LAYOUTS_KEY]: _old, ...rest } = row.preferences ?? {}
  const preferences = Object.keys(next).length ? { ...rest, [DASHBOARD_LAYOUTS_KEY]: next } : rest
  await db.update(schema.users).set({ preferences }).where(eq(schema.users.id, userId))
  return next
}
