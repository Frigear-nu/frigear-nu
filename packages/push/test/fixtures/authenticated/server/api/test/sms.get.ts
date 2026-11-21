import { texts } from '../../utils/sms-driver'

export default defineEventHandler((event) => {
  const result = [...texts]
  if (getQuery(event).reset) texts.length = 0
  return result
})
