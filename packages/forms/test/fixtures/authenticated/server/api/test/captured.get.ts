import { captured } from '../../plugins/capture'

export default defineEventHandler((event) => {
  const result = [...captured]
  if (getQuery(event).reset) captured.length = 0
  return result
})
