import { db } from '@nuxthub/db'
import type { UserSelect } from '@nuxthub/db/schema'
import { objectOmit } from '@vueuse/core'

export const mapUserToSession = (user: UserSelect) => {
  return objectOmit(user, ['password'])
}

export const findUserByEmail = async (
  email: UserSelect['email'] | string,
) => {
  return db.query.users.findFirst({
    where: (t, { eq }) => eq(t.email, email?.toLowerCase()),
  })
}

export const findUserById = async (
  id: UserSelect['id'] | string,
) => {
  return db.query.users.findFirst({
    where: (t, { eq }) => eq(t.id, id),
  })
}
