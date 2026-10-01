import { db, schema } from '@nuxthub/db'

import { z } from 'zod'

export default defineWebAuthnRegisterEventHandler({
  async validateUser(userBody, event) {
    const session = await getUserSession(event)

    if (session.user?.email && session.user.email !== userBody.userName) {
      throw createError({ statusCode: 400, statusMessage: 'Email does not match the current session.' })
    }

    return z.object({ userName: z.string().email() }).parse(userBody)
  },
  async onSuccess(event, { credential, user }) {
    let dbUser = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, user.userName) })

    if (dbUser) {
      const session = await getUserSession(event)
      if (session.user?.email !== dbUser.email) {
        throw createError({ statusCode: 403, statusMessage: 'Authenticate before adding a passkey to this account.' })
      }
    } else {
      const [created] = await db.insert(schema.users).values({ name: user.userName, email: user.userName }).returning()
      dbUser = created
    }

    await db.insert(schema.userCredentials).values({
      id: credential.id,
      userId: dbUser.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      backedUp: credential.backedUp,
      transports: credential.transports,
    })

    await setUserSession(event, { user: mapUserToSession(dbUser) })
  },
})
