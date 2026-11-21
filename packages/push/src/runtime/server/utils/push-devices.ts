import { db, schema } from '@nuxthub/db'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { isoDate } from '@frigear-nu/module-kit/server'
import type { PushDeviceDto, PushPlatform, RegisterDeviceInput } from '../../../types'

type DeviceRow = typeof schema.pushDevices.$inferSelect

export function toPushDeviceDto(row: DeviceRow): PushDeviceDto {
  return {
    id: row.id,
    userId: row.userId,
    platform: row.platform as PushPlatform,
    appId: row.appId,
    locale: row.locale,
    lastSeenAt: isoDate(row.lastSeenAt),
    createdAt: isoDate(row.createdAt),
    revokedAt: isoDate(row.revokedAt),
  }
}

const newDeviceId = () => `psd_${crypto.randomUUID().replaceAll('-', '')}`

/**
 * Registers a device for `userId`. A token that is already registered moves to this user (a phone changes hands) and
 * is active again, so registering is idempotent. Fires `push:device:registered`.
 */
export async function registerPushDevice(event: H3Event, userId: number, input: RegisterDeviceInput): Promise<PushDeviceDto> {
  const now = new Date()
  const [row] = await db.insert(schema.pushDevices).values({
    id: newDeviceId(),
    userId,
    platform: input.platform,
    token: input.token,
    appId: input.appId ?? null,
    locale: input.locale ?? null,
    lastSeenAt: now,
    createdAt: now,
  }).onConflictDoUpdate({
    target: schema.pushDevices.token,
    set: { userId, platform: input.platform, appId: input.appId ?? null, locale: input.locale ?? null, lastSeenAt: now, revokedAt: null },
  }).returning()
  const device = toPushDeviceDto(row!)
  await useNitroApp().hooks.callHook('push:device:registered', { event, device })
  return device
}

/** The user's active devices, newest first. */
export async function listPushDevices(userId: number): Promise<PushDeviceDto[]> {
  const rows = await db.select().from(schema.pushDevices)
    .where(and(eq(schema.pushDevices.userId, userId), isNull(schema.pushDevices.revokedAt)))
    .orderBy(desc(schema.pushDevices.createdAt), desc(schema.pushDevices.lastSeenAt))
  return rows.map(toPushDeviceDto)
}

/** Every device of the user, revoked ones included, newest first (the staff view). */
export async function listAllPushDevices(userId: number): Promise<PushDeviceDto[]> {
  const rows = await db.select().from(schema.pushDevices)
    .where(eq(schema.pushDevices.userId, userId))
    .orderBy(desc(schema.pushDevices.createdAt), desc(schema.pushDevices.lastSeenAt))
  return rows.map(toPushDeviceDto)
}

/** One of the user's own devices, or `undefined` (also for another user's device: nothing is revealed about it). */
export async function findOwnPushDevice(userId: number, id: string): Promise<DeviceRow | undefined> {
  const [row] = await db.select().from(schema.pushDevices)
    .where(and(eq(schema.pushDevices.id, id), eq(schema.pushDevices.userId, userId)))
    .limit(1)
  return row
}

/** Removes the user's device by id. */
export async function removePushDevice(userId: number, id: string): Promise<void> {
  await db.delete(schema.pushDevices).where(and(eq(schema.pushDevices.id, id), eq(schema.pushDevices.userId, userId)))
}

/** Removes the user's device by token; a token that is unknown or belongs to someone else is ignored. */
export async function removePushDeviceByToken(userId: number, token: string): Promise<void> {
  await db.delete(schema.pushDevices).where(and(eq(schema.pushDevices.token, token), eq(schema.pushDevices.userId, userId)))
}
