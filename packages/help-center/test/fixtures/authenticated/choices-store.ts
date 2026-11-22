import type { NotificationChoices, NotifyChoicesStore } from '@frigear-nu/notify/types'

// Test-only: notify's choices store, standing in for `@frigear-nu/preferences`. In memory: a user with no stored choices
// gets the topics' defaults, as with preferences. `POST /api/test/choices` writes through it.

const choicesByUser = ((globalThis as { __helpTestChoices?: Map<number, NotificationChoices> }).__helpTestChoices ??= new Map())

const store: NotifyChoicesStore = {
  async readChoices(userId) {
    return choicesByUser.get(Number(userId)) ?? {}
  },
  async writeChoices(userId, choices) {
    const current = choicesByUser.get(Number(userId)) ?? {}
    const merged: NotificationChoices = { ...current }
    for (const [topic, channels] of Object.entries(choices)) merged[topic] = { ...current[topic], ...channels }
    choicesByUser.set(Number(userId), merged)
  },
}

export default store
