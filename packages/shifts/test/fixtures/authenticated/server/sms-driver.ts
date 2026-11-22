import type { SMSDriver } from '@frigear-nu/notify/types'
import { testSms } from './utils/test-state'

// Test-only SMS driver: keeps what notify was asked to send (`GET /api/test/sms`).
const driver: SMSDriver = (notification) => {
  testSms.push({ to: [notification.to].flat(), body: notification.body })
}

export default driver
