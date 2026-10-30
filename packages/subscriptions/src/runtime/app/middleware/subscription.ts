import { defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig, useSubscription } from '#imports'

interface SubscriptionMeta {
  plans?: string[]
  redirectTo?: string
}

export default defineNuxtRouteMiddleware(async (to) => {
  const meta = to.meta.subscription as SubscriptionMeta | undefined
  const config = useRuntimeConfig().public.subscriptions as { pages?: { membership?: string } } | undefined
  const target = meta?.redirectTo ?? config?.pages?.membership
  if (!target || to.path === target) return

  // The same cached response the pages read, so guarding a route costs no extra request (and none at all when the
  // visitor is signed out, or when the page already loaded it on the server and hydration seeded the cache).
  const { plan } = await useSubscription()
  const activePlan = plan.value

  const allowed = activePlan !== null && (!meta?.plans?.length || meta.plans.includes(activePlan))
  if (!allowed) return navigateTo({ path: target, query: { redirect: to.fullPath } })
})
