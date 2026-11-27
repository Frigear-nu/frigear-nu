import type { EmailDriver } from '@frigear-nu/notify'

let sent = 0

// Stands in for a driver that sets its own Message-ID (Notify's `cloudflare-binding`): it sends nothing and reports a
// Message-ID per email, also kept on the notification as `sentMessageId`, so a test can answer it.
const driver: EmailDriver = (notification) => {
  const messageId = `sent-${++sent}-${Date.now()}@reply.test`
  Object.assign(notification, { sentMessageId: messageId })
  return { messageId }
}

export default driver
