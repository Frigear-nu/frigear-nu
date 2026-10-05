import type { UIDriver } from '../../../types'
import { useToast } from '#imports'

const nuxtUiDriver: UIDriver = (notification) => {
  useToast().add({
    title: notification.title,
    description: notification.text,
    color: notification?.type === 'error' ? 'error' : 'success',
    actions: notification?.actions,
  })
}
export default nuxtUiDriver
