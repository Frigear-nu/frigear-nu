import { text } from 'drizzle-orm/pg-core'
import { defineTableColumns } from '@frigear-nu/module-kit/utils'

export const users = defineTableColumns({
  locale: text().default('da'),
})
