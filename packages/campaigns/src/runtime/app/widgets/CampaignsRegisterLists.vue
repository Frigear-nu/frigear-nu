<script setup lang="ts">
import type { CampaignSignupListDto } from '../../../types'
import { campaignsApi } from '../../utils/api'
import { computed, ref, useCampaignsTranslate, useLazyFetch, useModuleT, watch } from '#imports'

defineOptions({ name: 'CampaignsRegisterLists' })

// The lists the registration form offers (`signupMode: 'offer'`), in auth's `auth.register` widget area: an unticked
// box per list with its consent text. The ticked ids go with the registration as `extras.campaigns.listIds`, and the
// `auth:user:created` listener signs the new account up.
const props = defineProps<{
  /** From the registration form: puts a value under the module's key of the request's `extras`. */
  setExtra: (module: string, value: unknown) => void
}>()

const t = useModuleT('campaigns')
const tr = useCampaignsTranslate()
const { data: lists, status } = useLazyFetch<CampaignSignupListDto[]>(campaignsApi.signupLists, { key: 'campaigns:signup-lists', default: () => [] })
const loading = computed(() => status.value === 'pending' && !lists.value?.length)

const ticked = ref<string[]>([])
function toggle(id: string, on: boolean | 'indeterminate') {
  ticked.value = on === true ? [...new Set([...ticked.value, id])] : ticked.value.filter(value => value !== id)
}
watch(ticked, (ids) => {
  props.setExtra('campaigns', ids.length ? { listIds: ids } : undefined)
})
</script>

<template>
  <div
    v-if="loading"
    class="flex flex-col gap-2"
  >
    <USkeleton class="h-5 w-2/3" />
  </div>
  <fieldset
    v-else-if="lists?.length"
    class="flex flex-col gap-3"
    data-campaigns-register-lists
  >
    <legend class="sr-only">
      {{ t('register.legend', 'Lists') }}
    </legend>
    <UCheckbox
      v-for="list in lists"
      :key="list.id"
      :model-value="ticked.includes(list.id)"
      :label="tr(list.consentText) || t('register.consentDefault', 'Yes, send me {name}.', { name: tr(list.name) })"
      :description="list.consentText ? tr(list.name) : tr(list.description) || undefined"
      :name="`campaigns-list-${list.slug}`"
      @update:model-value="(value: boolean | 'indeterminate') => toggle(list.id, value)"
    />
  </fieldset>
</template>
