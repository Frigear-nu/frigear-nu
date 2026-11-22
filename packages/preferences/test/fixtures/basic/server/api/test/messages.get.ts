import { testMails } from '../../utils/mail-driver'
import { testTexts } from '../../utils/sms-driver'

// Test-only: the emails and texts sent since the last reset, and `?reset=1` empties them.
export default defineEventHandler((event) => {
  const result = { mails: [...testMails], texts: [...testTexts] }
  if (getQuery(event).reset) {
    testMails.length = 0
    testTexts.length = 0
  }
  return result
})
