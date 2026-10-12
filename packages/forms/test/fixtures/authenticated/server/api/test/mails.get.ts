import { mails } from '../../utils/mail-driver'

export default defineEventHandler((event) => {
  const result = [...mails]
  if (getQuery(event).reset) mails.length = 0
  return result
})
