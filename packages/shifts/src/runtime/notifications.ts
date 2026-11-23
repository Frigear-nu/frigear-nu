import type { NotificationTopic } from '@frigear-nu/notify/utils'

// The notification topics shifts registers with notify's `extendNotificationTopics` (the rows of
// the account's channel matrix, and what `notifyUser` checks a person's choices against). The defaults are email and push;
// SMS is offered where it costs money for a reason (a reminder, a broadcast) and stays off until the person turns it on.
// `shifts.digest` reaches leads only: the exceptions of their teams after a run of `shifts:close-shifts`.

export const SHIFTS_TOPICS = {
  reminder: 'shifts.reminder',
  swap: 'shifts.swap',
  broadcast: 'shifts.broadcast',
  digest: 'shifts.digest',
} as const

export type ShiftsTopic = typeof SHIFTS_TOPICS[keyof typeof SHIFTS_TOPICS]

export const shiftsNotificationTopics: NotificationTopic[] = [
  {
    id: SHIFTS_TOPICS.reminder,
    label: { da: 'Vagtpåmindelser', en: 'Shift reminders' },
    description: { da: 'En påmindelse før dine vagter starter.', en: 'A reminder before your shifts start.' },
    defaults: { email: true, sms: false, push: true },
    channels: ['email', 'sms', 'push'],
  },
  {
    id: SHIFTS_TOPICS.swap,
    label: { da: 'Vagtbytter', en: 'Shift swaps' },
    description: { da: 'Tilbud, svar og godkendelser, når vagter byttes.', en: 'Offers, answers and approvals when shifts are swapped.' },
    defaults: { email: true, sms: false, push: true },
    channels: ['email', 'push'],
  },
  {
    id: SHIFTS_TOPICS.broadcast,
    label: { da: 'Beskeder til vagtholdet', en: 'Messages to the shift team' },
    description: { da: 'Beskeder fra ledere og koordinatorer til dit hold.', en: 'Messages from leads and coordinators to your team.' },
    defaults: { email: true, sms: false, push: true },
    channels: ['email', 'sms', 'push'],
  },
  {
    id: SHIFTS_TOPICS.digest,
    label: { da: 'Overblik for ledere', en: 'Lead digest' },
    description: { da: 'No-shows og andet, der skal ses på, på de hold, du leder.', en: 'No-shows and other exceptions on the teams you lead.' },
    defaults: { email: true, sms: false, push: true },
    channels: ['email', 'push'],
  },
]
