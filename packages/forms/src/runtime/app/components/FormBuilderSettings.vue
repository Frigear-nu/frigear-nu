<script setup lang="ts">
import type { FormDefinition } from '../../../types'
import {
  emailFieldKeys, patchEmailDelivery, routableFields, setEmailRecipients, setRoute, setRouteField, setStorage, storageWarnings, translate,
} from '../../utils'
import { useFormsLocale } from '../composables/useForms'

const definition = defineModel<FormDefinition>({ required: true })

const t = useModuleT('forms')
const locale = useFormsLocale()

const email = computed(() => definition.value.delivery?.email)
const warnings = computed(() => storageWarnings(definition.value))
const replyToFields = computed(() => emailFieldKeys(definition.value))
const routable = computed(() => routableFields(definition.value))
const routeField = computed(() => routable.value.find(field => field.key === email.value?.routes?.field))

const NONE = '__none__'
const replyToItems = computed(() => [
  { value: NONE, label: t('delivery.replyToNone', 'None') },
  ...replyToFields.value.map(value => ({ value, label: value })),
])
const routeFieldItems = computed(() => [
  { value: NONE, label: t('delivery.routingNone', 'No routing') },
  ...routable.value.map(field => ({ value: field.key, label: translate(field.label, locale.value) || field.key })),
])
</script>

<template>
  <div class="max-w-2xl space-y-8">
    <section class="space-y-3">
      <h2 class="font-semibold">
        {{ t('delivery.storeTitle', 'Store submissions') }}
      </h2>
      <USwitch
        :model-value="definition.storage === 'db'"
        :label="t('delivery.storeTitle', 'Store submissions')"
        :description="t('delivery.storeHint', 'Keep submissions in the database so they can be reviewed under Submissions.')"
        @update:model-value="definition = setStorage(definition, $event ? 'db' : 'none')"
      />
      <UAlert
        v-if="warnings.files"
        color="warning"
        variant="subtle"
        :title="t('delivery.filesWarning', 'This form has file upload fields, which need stored submissions. Remove them or keep storing.')"
      />
      <UAlert
        v-if="warnings.lost"
        color="warning"
        variant="subtle"
        :title="t('delivery.lostWarning', 'Submissions are neither stored nor emailed. Add recipients or keep storing, or answers are lost unless something handles forms:submitted.')"
      />
    </section>

    <section class="space-y-4">
      <h2 class="font-semibold">
        {{ t('delivery.emailTitle', 'Email notification') }}
      </h2>
      <UFormField
        :label="t('delivery.recipients', 'Recipients')"
        :description="t('delivery.recipientsHint', 'Press Enter after each address. Leave empty to turn email off.')"
      >
        <UInputTags
          :model-value="email?.to ?? []"
          type="email"
          class="w-full"
          @update:model-value="definition = setEmailRecipients(definition, $event)"
        />
      </UFormField>

      <p
        v-if="!email"
        class="text-sm text-muted"
      >
        {{ t('delivery.needRecipients', 'Add recipients first to set the subject, reply-to and routing.') }}
      </p>

      <template v-else>
        <UFormField :label="t('delivery.subject', 'Subject')">
          <FormBuilderText
            :model-value="email.subject"
            @update:model-value="definition = patchEmailDelivery(definition, { subject: $event })"
          />
        </UFormField>

        <UFormField
          :label="t('delivery.replyTo', 'Reply to')"
          :description="t('delivery.replyToHint', 'The answer of this email field becomes the Reply-To.')"
        >
          <USelect
            :model-value="email.replyToField ?? NONE"
            :items="replyToItems"
            :disabled="!replyToFields.length"
            class="w-full"
            @update:model-value="definition = patchEmailDelivery(definition, { replyToField: $event === NONE ? undefined : String($event) })"
          />
        </UFormField>

        <UFormField
          v-if="routable.length"
          :label="t('delivery.routing', 'Route by answer')"
          :description="t('delivery.routingHint', 'Send to other recipients depending on the answer. Others get the default recipients.')"
        >
          <USelect
            :model-value="email.routes?.field ?? NONE"
            :items="routeFieldItems"
            class="w-full"
            @update:model-value="definition = setRouteField(definition, $event === NONE ? undefined : String($event))"
          />
        </UFormField>

        <template v-if="routeField">
          <UFormField
            v-for="option in routeField.options"
            :key="option.value"
            :label="t('delivery.routeTo', 'Recipients for “{value}”', { value: translate(option.label, locale) || option.value })"
          >
            <UInputTags
              :model-value="email.routes?.to[option.value] ?? []"
              type="email"
              class="w-full"
              @update:model-value="definition = setRoute(definition, option.value, $event)"
            />
          </UFormField>
        </template>
      </template>
    </section>
  </div>
</template>
