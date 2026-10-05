import { useToast } from '#imports'
import { defineUIDriver } from '../../server/utils/definers'

const nuxtUiDriver = defineUIDriver((notification) => {
  useToast().add({
    title: notification.title,
    description: notification.text,
    color: notification?.type === 'error' ? 'error' : 'success',
    actions: notification?.actions,
  })
})

export default nuxtUiDriver
