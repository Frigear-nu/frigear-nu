<script setup lang="ts">
import { isDateWithinDisabledRange, parseDisabledRange, type PublicPrice } from '#shared/types/membership'
import { useUserMemberships } from '~/store/queries/user'

const { locale } = useI18n()
const { loggedIn } = useUserSession()
const { clearCart, addToCart } = useShoppingCart()
const fetchUserMemberships = ref(false)
const { data: userMemberships } = useUserMemberships({ isEnabled: fetchUserMemberships })

defineProps<{
  mode: 'list' | 'tabs'
  orientation?: 'horizontal' | 'vertical'
}>()

const membershipPriceId = ref<string | undefined>()

watch(loggedIn, async (auth) => {
  if (!auth) {
    fetchUserMemberships.value = false
    membershipPriceId.value = undefined
    return
  }

  if (!fetchUserMemberships.value) {
    membershipPriceId.value = undefined
    fetchUserMemberships.value = true
  }
}, { immediate: true })

watch(userMemberships, (memberships) => {
  if (!memberships) return

  const [current] = memberships
  if (!current || !current.priceId) {
    membershipPriceId.value = undefined
    return
  }

  membershipPriceId.value = current.priceId
}, { immediate: true })

const onSelectMembership = (price: PublicPrice) => {
  clearCart()

  // we store the item in the localStorage cart - so it will persist as long as it is the same browser.
  addToCart({
    qty: 1,
    maxQty: 1,
    id: price.id,
    price: price.price,
    // @ts-expect-error This is not typed
    title: price?.[`title_${locale.value}`] || price.title,
    // @ts-expect-error This is not typed
    description: price?.[`description_${locale.value}`] || price.description || undefined,
  })

  //
  if (loggedIn.value) return navigateTo(`/account/membership`)
  return navigateTo(`/sign-up`)
}

const transformPrices = (prices: PublicPrice[]): PublicPrice[] => {
  return prices.filter((price) => {
    if (!price.disabledRanges || (price.disabledRanges && price.disabledRanges.length === 0)) {
      return true
    }

    const matchedAnyWithinRange = price.disabledRanges.some((range) => {
      return isDateWithinDisabledRange(new Date(), parseDisabledRange(range))
    })

    return !matchedAnyWithinRange
  })
}
</script>

<template>
  <MembershipTypes
    :mode="mode"
    :orientation="orientation"
    :transform="transformPrices"
    @select="onSelectMembership"
  >
    <template
      v-if="membershipPriceId"
      #button="{ item }"
    >
      <UButton
        :disabled="membershipPriceId === item.id"
        block
        :variant="membershipPriceId === item.id ? 'subtle' : undefined"
        @click="onSelectMembership(item as PublicPrice)"
      >
        {{ membershipPriceId === item.id ? $t('common.current') : $t('actions.select') }}
      </UButton>
    </template>
  </MembershipTypes>
</template>
