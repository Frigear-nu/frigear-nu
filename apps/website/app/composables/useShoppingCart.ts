import { createSharedComposable, useLocalStorage } from '@vueuse/core'
import type { CartItem } from '#shared/types/shopping-cart'

type OptionalKeys = 'qty'
type AddCartItem = Omit<CartItem, OptionalKeys> & Partial<Pick<CartItem, OptionalKeys>>
type UpdateCartItem = Partial<Omit<AddCartItem, 'id'>>

const _useShoppingCart = () => {
  const isOpen = useLocalStorage('cart-modal-open', false)
  const data = useLocalStorage<CartItem[]>('cart', [])

  const hasAnyItems = computed(() => data.value.length > 0)
  const clearCart = () => data.value = []

  const addToCart = (item: AddCartItem) => {
    const existingItem = data.value.find(i => i.id === item.id)

    if (existingItem) {
      existingItem.qty += item.qty ?? 1
      return
    }
    return data.value.push({
      qty: 1,
      ...item,
    })
  }

  const updateCartItem = (id: CartItem['id'], item: UpdateCartItem) => {
    const existing = data.value.find(i => i.id === id)

    if (existing) {
      return Object.assign(existing, item)
    }

    return addToCart({ ...item, id } as CartItem)
  }

  const removeFromCart = (id: string) => {
    const index = data.value.findIndex(i => i.id === id)
    if (index === -1) return
    data.value.splice(index, 1)
  }

  const hasItem = (id: CartItem['id']) => {
    return data.value.some(i => i.id === id)
  }

  const getItem = (id: CartItem['id']) => {
    return data.value.find(i => i.id === id)
  }

  const checkout = async () => {
    // check if this is memberships or events:
    // would probably be best to have a "unified" checkout method in the future,
    // since everything is just stripe ids.
    isOpen.value = false
    return navigateTo('/account/membership')
  }

  return {
    isOpen,
    data: readonly(data),
    clearCart,
    hasAnyItems,
    hasItem,
    getItem,
    addToCart,
    updateCartItem,
    removeFromCart,
    checkout,
  }
}

export const useShoppingCart = createSharedComposable(_useShoppingCart)
