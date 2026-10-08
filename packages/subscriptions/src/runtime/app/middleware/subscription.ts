interface SubscriptionMeta {
  plans?: string[]
  redirectTo?: string
}

export default defineNuxtRouteMiddleware(async (to) => {
  const meta = to.meta.subscription as SubscriptionMeta | undefined
  const config = useRuntimeConfig().public.subscriptions as { pages?: { membership?: string } } | undefined
  const target = meta?.redirectTo ?? config?.pages?.membership
  if (!target || to.path === target) return

  const { loggedIn } = useUserSession()
  let activePlan: string | null = null
  if (loggedIn.value) {
    const me = await useRequestFetch()<{ activePlan: string | null }>('/api/subscriptions/me').catch(() => null)
    activePlan = me?.activePlan ?? null
  }

  const allowed = activePlan !== null && (!meta?.plans?.length || meta.plans.includes(activePlan))
  if (!allowed) return navigateTo({ path: target, query: { redirect: to.fullPath } })
})
