// Host policy for `@frigear-nu/forms`: who may manage forms and read submissions. There is no role
// model in this app yet, so staff are an email allowlist (NUXT_FORMS_ADMIN_EMAILS) or admins.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:authorize', async (ctx) => {
    const staff = useRuntimeConfig().formsAdminEmails.split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
    const { user } = await getUserSession(ctx.event)
    ctx.allowed = !!user?.email && (staff.includes(user.email.toLowerCase()) || user.role === 'admin')
  })
})
