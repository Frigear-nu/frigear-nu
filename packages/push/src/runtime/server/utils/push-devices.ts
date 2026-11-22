import { db, schema } from '@nuxthub/db'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { isoDate } from '@frigear-nu/module-kit/server'
import type { PushDeviceDto, PushPlatform, PushProvider, PushRuntimeConfig, RegisterDeviceInput } from '../../../types'
import { isPushProvider, resolveDeviceProvider, resolveIosProvider } from '../../providers/config'
import { newId } from '@frigear-nu/module-kit/id'

type DeviceRow = typeof schema.pushDevices.$inferSelect

export function toPushDeviceDto(row: DeviceRow): PushDeviceDto {
  return {
    id: row.id,
    userId: row.userId,
    platform: row.platform as PushPlatform,
    provider: isPushProvider(row.provider) ? row.provider : null,
    appId: row.appId,
    locale: row.locale,
    lastSeenAt: isoDate(row.lastSeenAt),
    createdAt: isoDate(row.createdAt),
    revokedAt: isoDate(row.revokedAt),
  }
}

const newDeviceId = () => newId('psd')

/**
 * Registers a device for `userId`. A token that is already registered moves to this user (a phone changes hands) and
 * is active again, so registering is idempotent. The provider is stored resolved (what the device said, else FCM on
 * Android and `push.ios` on iOS), and registering again updates it. `input.replaces` is the token the installation
 * registered before (its APNs token, now that it registers its FCM token): the user's device with it is removed, so the
 * installation is not notified twice. Fires `push:device:registered`.
 */
export async function registerPushDevice(event: H3Event, userId: number, input: RegisterDeviceInput): Promise<PushDeviceDto> {
  const now = new Date()
  // `platform` is `ios` or `android` here (the route refuses `web`), so a provider always resolves.
  const provider: PushProvider = resolveDeviceProvider(input, resolveIosProvider(useRuntimeConfig().push as PushRuntimeConfig)) ?? 'fcm'
  const [row] = await db.insert(schema.pushDevices).values({
    id: newDeviceId(),
    userId,
    platform: input.platform,
    token: input.token,
    provider,
    appId: input.appId ?? null,
    locale: input.locale ?? null,
    lastSeenAt: now,
    createdAt: now,
  }).onConflictDoUpdate({
    target: schema.pushDevices.token,
    set: { userId, platform: input.platform, provider, appId: input.appId ?? null, locale: input.locale ?? null, lastSeenAt: now, revokedAt: null },
  }).returning()
  if (input.replaces && input.replaces !== input.token) {
    // Only the caller's own device: a token of another user is left alone, like unregistering.
    await removePushDeviceByToken(userId, input.replaces)
  }
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
