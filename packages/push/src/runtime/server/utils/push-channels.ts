import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { AnyColumn } from 'drizzle-orm'
import { topics } from '#push/topics'
import type { ChannelMatrixDto, ChannelMatrixRow, ChannelSettings, NotificationTopic } from '../../../types'
import { resolveChannelSettings, topicChannels } from '../../utils/topics'

/** The topics modules registered with `extendNotificationTopics`. */
export const registeredPushTopics = (): readonly NotificationTopic[] => topics

export const findPushTopic = (id: string): NotificationTopic | undefined => topics.find(topic => topic.id === id)

/** What the user chose, per topic id. Topics without a row use the topic's defaults. */
export async function loadPushChannelChoices(userId: number): Promise<Map<string, ChannelSettings>> {
  const rows = await db.select().from(schema.pushChannelPreferences).where(eq(schema.pushChannelPreferences.userId, userId))
  return new Map(rows.map(row => [row.topic, { email: row.email, sms: row.sms, push: row.push }]))
}

/** The channels that apply to a user for one topic. */
export async function pushChannelSettingsFor(userId: number, topic: NotificationTopic): Promise<ChannelSettings> {
  const [row] = await db.select().from(schema.pushChannelPreferences)
    .where(and(eq(schema.pushChannelPreferences.userId, userId), eq(schema.pushChannelPreferences.topic, topic.id)))
    .limit(1)
  return resolveChannelSettings(topic, row)
}

/**
 * The user's phone number, read from a `phone` column on `users` when the app has one (this module does not add it).
 * `null` without the column or without a value.
 */
export async function pushUserPhone(userId: number): Promise<string | null> {
  const column = (schema.users as unknown as Record<string, AnyColumn | undefined>).phone
  if (!column) return null
  const [row] = await db.select({ phone: column }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  return typeof row?.phone === 'string' && row.phone.trim() ? row.phone.trim() : null
}

/** The matrix `GET /api/push/me/channels` answers: every registered topic with what applies to the user. */
export async function readPushChannelMatrix(userId: number): Promise<ChannelMatrixDto> {
  const [choices, phone, devices] = await Promise.all([
    loadPushChannelChoices(userId),
    pushUserPhone(userId),
    db.select({ id: schema.pushDevices.id }).from(schema.pushDevices)
      .where(and(eq(schema.pushDevices.userId, userId), isNull(schema.pushDevices.revokedAt)))
      .limit(1),
  ])
  const rows: ChannelMatrixRow[] = topics.map(topic => ({
    id: topic.id,
    label: topic.label ?? topic.id,
    labelKey: topic.labelKey,
    description: topic.description,
    descriptionKey: topic.descriptionKey,
    channels: topicChannels(topic),
    settings: resolveChannelSettings(topic, choices.get(topic.id)),
    custom: choices.has(topic.id),
  }))
  return { hasPhone: phone !== null, hasDevice: devices.length > 0, topics: rows }
}

/**
 * Stores changes to the user's channels. `changes` maps a topic id to the channels to set; a channel the topic does
 * not offer is ignored. The row that results is complete (a topic's other channels keep what applied before).
 */
export async function savePushChannelChoices(userId: number, changes: Record<string, Partial<ChannelSettings>>): Promise<void> {
  const ids = Object.keys(changes)
  if (!ids.length) return
  const existing = await db.select().from(schema.pushChannelPreferences)
    .where(and(eq(schema.pushChannelPreferences.userId, userId), inArray(schema.pushChannelPreferences.topic, ids)))
  const stored = new Map(existing.map(row => [row.topic, row]))

  for (const id of ids) {
    const topic = findPushTopic(id)
    if (!topic) continue
    const offered = topicChannels(topic)
    const change = Object.fromEntries(Object.entries(changes[id]!).filter(([channel]) => offered.includes(channel as keyof ChannelSettings)))
    const next = { ...resolveChannelSettings(topic, stored.get(id)), ...change }
    await db.insert(schema.pushChannelPreferences)
      .values({ userId, topic: id, ...next })
      .onConflictDoUpdate({
        target: [schema.pushChannelPreferences.userId, schema.pushChannelPreferences.topic],
        set: { ...next, updatedAt: new Date() },
      })
  }
}
