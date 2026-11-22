import { db, schema } from '@nuxthub/db'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { apiError, isoDate } from '@frigear-nu/module-kit/server'
import { sha256Hex } from '@frigear-nu/module-kit/crypto'
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
 * `push.ios`, or its default (`apns`) while the setting is invalid: a bad setting is logged at startup and must not
 * make every registration fail. Registering again after the fix stores the right provider.
 */
function iosProviderOf(config: PushRuntimeConfig): PushProvider {
  try {
    return resolveIosProvider(config)
  }
  catch {
    return 'apns'
  }
}

/** SHA-256 (hex) of an installation secret: the only form it is stored in. */
export const hashPushInstallationSecret = (secret: string): Promise<string> => sha256Hex(secret)

/**
 * Registers a device for `userId`. Registering is idempotent: the same user registering the same token again (with or
 * without the installation secret) keeps the row and makes it active again. The row is bound to the installation by
 * `input.secret` (stored as a hash): a token that is registered to another user moves to this one only when the request
 * carries the same secret (the phone changed hands); otherwise it answers 409 `device_owned` and nothing changes. The
 * provider is stored resolved (what the device said, else FCM on Android and `push.ios` on iOS), and registering again
 * updates it and clears `revokedAt` and the failure count. `input.replaces` is the token the installation registered
 * before (its APNs token, now that it registers its FCM token): the caller's device with it is removed when it is bound
 * to the same secret (or to none), so the installation is not notified twice. Fires `push:device:registered`.
 */
export async function registerPushDevice(event: H3Event, userId: number, input: RegisterDeviceInput): Promise<PushDeviceDto> {
  const now = new Date()
  // `platform` is `ios` or `android` here (the route refuses `web`), so a provider always resolves.
  const provider: PushProvider = resolveDeviceProvider(input, iosProviderOf(useRuntimeConfig().push as PushRuntimeConfig)) ?? 'fcm'
  const secretHash = input.secret ? await hashPushInstallationSecret(input.secret) : null
  const table = schema.pushDevices
  // One statement, so two users cannot race for a token: the existing row is only updated when it is the caller's, or
  // when the caller proves it holds the installation (same secret).
  const owned = secretHash ? or(eq(table.userId, userId), eq(table.secretHash, secretHash)) : eq(table.userId, userId)
  const [row] = await db.insert(table).values({
    id: newDeviceId(),
    userId,
    platform: input.platform,
    token: input.token,
    provider,
    appId: input.appId ?? null,
    locale: input.locale ?? null,
    secretHash,
    failures: 0,
    lastSeenAt: now,
    createdAt: now,
  }).onConflictDoUpdate({
    target: table.token,
    set: {
      userId,
      platform: input.platform,
      provider,
      appId: input.appId ?? null,
      locale: input.locale ?? null,
      lastSeenAt: now,
      revokedAt: null,
      failures: 0,
      // Without a secret the row keeps the one it is bound to.
      ...(secretHash ? { secretHash } : {}),
    },
    setWhere: owned,
  }).returning()
  if (!row) throw apiError(409, 'device_owned', 'This device is registered to another account.')
  if (input.replaces && input.replaces !== input.token && input.secret) {
    // Only the caller's own device of this installation: a token of another user, or bound to another secret, stays.
    await removePushDeviceByToken(userId, input.replaces, input.secret)
  }
  const device = toPushDeviceDto(row)
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

/**
 * Removes the user's device by token, when `secret` is the installation secret it is bound to (or it is bound to none).
 * A token that is unknown, belongs to someone else or is bound to another secret is ignored.
 */
export async function removePushDeviceByToken(userId: number, token: string, secret: string): Promise<void> {
  const table = schema.pushDevices
  const secretHash = await hashPushInstallationSecret(secret)
  await db.delete(table).where(and(eq(table.token, token), eq(table.userId, userId), or(isNull(table.secretHash), eq(table.secretHash, secretHash))))
}
