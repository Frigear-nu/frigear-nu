<script setup lang="ts">
import type { CreatedFormAccessTokenDto, FormAccessTokenDto, FormAuthMode, FormAvailability, FormDefinition, FormPasswordStatusDto, FormSchedule, FormScheduleMoment } from '../../../types'
import { formsApi, resolveAccess, setAccess } from '../../utils'
import { $fetch, computed, ref, useCopyToClipboard, useErrorToast, useFetch, useFormat, useModuleT, useRequestURL, useToast } from '#imports'

const definition = defineModel<FormDefinition>({ required: true })
const props = defineProps<{ formId: string, slug: string }>()

const t = useModuleT('forms')
const toast = useToast()
const showError = useErrorToast()
const { copy: copyText } = useCopyToClipboard()
const format = useFormat()
const access = computed(() => resolveAccess(definition.value))

const availabilities = computed(() => [
  { value: 'web', label: t('access.availabilityWeb', 'Web page and API') },
  { value: 'api', label: t('access.availabilityApi', 'API only') },
])
const authModes = computed(() => [
  { value: 'none', label: t('access.authNone', 'Open to everyone') },
  { value: 'user', label: t('access.authUser', 'Signed-in users') },
  { value: 'token', label: t('access.authToken', 'API token') },
  { value: 'password', label: t('access.authPassword', 'Shared password') },
])

// --- Schedule -------------------------------------------------------------------------------
const schedule = computed<FormSchedule>(() => access.value.schedule ?? { type: 'always' })
const scheduleTypes = computed(() => [
  { value: 'always', label: t('schedule.always', 'Always open') },
  { value: 'yearly', label: t('schedule.yearly', 'Every year (a season)') },
  { value: 'range', label: t('schedule.range', 'One fixed period') },
])
const months = computed(() => Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2000, i, 1)),
})))
const setSchedule = (next: FormSchedule) => {
  definition.value = setAccess(definition.value, { schedule: next.type === 'always' ? undefined : next })
}
function changeScheduleType(type: FormSchedule['type']) {
  if (type === 'yearly') setSchedule({ type, from: { month: 1, day: 1, time: '00:00' }, to: { month: 2, day: 1, time: '00:00' }, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
  else if (type === 'range') setSchedule({ type })
  else setSchedule({ type: 'always' })
}
const toLocalInput = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : undefined)
function patchMoment(side: 'from' | 'to', patch: Partial<FormScheduleMoment>) {
  if (schedule.value.type === 'yearly') setSchedule({ ...schedule.value, [side]: { ...schedule.value[side], ...patch } })
}

const fail = (cause: unknown) => showError(cause, t('error.generic', 'Something went wrong. Please try again.'))

// --- Tokens ---------------------------------------------------------------------------------
const { data: tokens, refresh: refreshTokens } = await useFetch<FormAccessTokenDto[]>(() => formsApi.admin.tokens(props.formId), { default: () => [] })
const tokenName = ref('')
const creating = ref(false)
const revealed = ref<CreatedFormAccessTokenDto>()

async function createToken() {
  creating.value = true
  try {
    revealed.value = await $fetch<CreatedFormAccessTokenDto>(formsApi.admin.tokens(props.formId), { method: 'POST', body: { name: tokenName.value } })
    tokenName.value = ''
    await refreshTokens()
  }
  catch (cause) {
    fail(cause)
  }
  finally {
    creating.value = false
  }
}

async function revoke(token: FormAccessTokenDto) {
  try {
    await $fetch(formsApi.admin.token(props.formId, token.id), { method: 'DELETE' })
    await refreshTokens()
  }
  catch (cause) {
    fail(cause)
  }
}

const copy = (text: string) => copyText(text, t('preview.copied', 'Copied to clipboard.'))

// --- Password -------------------------------------------------------------------------------
const { data: passwordStatus, refresh: refreshPassword } = await useFetch<FormPasswordStatusDto>(() => formsApi.admin.password(props.formId), { default: () => ({ set: false }) })
const password = ref('')
const savingPassword = ref(false)

// The row's hint: whether a password is set, and that it is ignored unless authentication is Shared password. The
// missing-password warning above the row replaces the first part.
const passwordHint = computed(() => [
  access.value.auth === 'password' && !passwordStatus.value?.set
    ? ''
    : passwordStatus.value?.set ? t('access.passwordIsSet', 'A password is set.') : t('access.passwordIsNotSet', 'No password is set.'),
  access.value.auth !== 'password' ? t('access.passwordInactive', 'It is only checked when authentication is set to Shared password.') : '',
].filter(Boolean).join(' ') || undefined)

async function savePassword() {
  savingPassword.value = true
  try {
    await $fetch(formsApi.admin.password(props.formId), { method: 'PUT', body: { password: password.value } })
    password.value = ''
    await refreshPassword()
    toast.add({ title: t('access.passwordSaved', 'Password saved.'), color: 'success' })
  }
  catch (cause) {
    fail(cause)
  }
  finally {
    savingPassword.value = false
  }
}

async function clearPassword() {
  try {
    await $fetch(formsApi.admin.password(props.formId), { method: 'DELETE' })
    await refreshPassword()
  }
  catch (cause) {
    fail(cause)
  }
}

// --- API snippet ----------------------------------------------------------------------------
const origin = useRequestURL().origin
const submitUrl = computed(() => `${origin}${formsApi.submit(props.slug)}`)
const snippet = computed(() => {
  const headers = {
    token: '  -H \'Authorization: Bearer TOKEN\' \\\n',
    password: '  -H \'x-form-password: <password>\' \\\n',
    user: '  -H \'Cookie: <session cookie of a signed-in user>\' \\\n',
    none: '',
  }[access.value.auth]
  return `curl -X POST '${submitUrl.value}' \\\n${headers}  -H 'content-type: application/json' \\\n  -d '{"answers":{"field":"value"},"locale":"en"}'`
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <SectionCard :title="t('access.title', 'Who can use this form')">
      <div class="flex flex-col divide-y divide-default">
        <FormRow
          :label="t('access.availability', 'Availability')"
          :description="access.availability === 'api'
            ? t('access.availabilityApiHint', 'No public page: the form can only be read and submitted through the API.')
            : t('access.availabilityWebHint', 'The public page and the API are both available.')"
        >
          <USelect
            :model-value="access.availability"
            :items="availabilities"
            :disabled="access.auth === 'token'"
            class="w-full sm:max-w-sm"
            @update:model-value="definition = setAccess(definition, { availability: $event as FormAvailability })"
          />
        </FormRow>

        <FormRow
          :label="t('access.auth', 'Authentication')"
          :description="access.auth === 'token' ? t('access.authTokenHint', 'Token forms are API only: a token cannot be typed into a page.') : undefined"
        >
          <USelect
            :model-value="access.auth"
            :items="authModes"
            class="w-full sm:max-w-sm"
            @update:model-value="definition = setAccess(definition, { auth: $event as FormAuthMode })"
          />
        </FormRow>
        <FormRow
          :label="t('schedule.title', 'Open period')"
          :description="t('schedule.hint', 'Outside the period the form shows a closed notice and rejects submissions. A season whose end is before its start wraps over new year.')"
        >
          <USelect
            :model-value="schedule.type"
            :items="scheduleTypes"
            class="w-full sm:max-w-sm"
            @update:model-value="changeScheduleType($event as FormSchedule['type'])"
          />
        </FormRow>

        <template v-if="schedule.type === 'range'">
          <FormRow :label="t('schedule.opens', 'Opens')">
            <UInput
              type="datetime-local"
              class="w-full sm:max-w-sm"
              :model-value="toLocalInput(schedule.from)"
              @update:model-value="setSchedule({ ...schedule, from: fromLocalInput($event as string) })"
            />
          </FormRow>
          <FormRow :label="t('schedule.closes', 'Closes')">
            <UInput
              type="datetime-local"
              class="w-full sm:max-w-sm"
              :model-value="toLocalInput(schedule.to)"
              @update:model-value="setSchedule({ ...schedule, to: fromLocalInput($event as string) })"
            />
          </FormRow>
        </template>

        <template v-else-if="schedule.type === 'yearly'">
          <FormRow
            v-for="side in (['from', 'to'] as const)"
            :key="side"
            :label="side === 'from' ? t('schedule.opens', 'Opens') : t('schedule.closes', 'Closes')"
          >
            <div class="grid grid-cols-3 gap-2 sm:max-w-sm">
              <UFormField :label="t('schedule.month', 'Month')">
                <USelect
                  :model-value="schedule[side].month"
                  :items="months"
                  class="w-full"
                  @update:model-value="patchMoment(side, { month: Number($event) })"
                />
              </UFormField>
              <UFormField :label="t('schedule.day', 'Day')">
                <UInput
                  type="number"
                  min="1"
                  max="31"
                  class="w-full"
                  :model-value="schedule[side].day"
                  @update:model-value="patchMoment(side, { day: Number($event) })"
                />
              </UFormField>
              <UFormField :label="t('schedule.time', 'Time')">
                <UInput
                  type="time"
                  class="w-full"
                  :model-value="schedule[side].time"
                  @update:model-value="patchMoment(side, { time: String($event) })"
                />
              </UFormField>
            </div>
          </FormRow>
          <FormRow :label="t('schedule.timezone', 'Timezone')">
            <UInput
              class="w-full sm:max-w-sm"
              :model-value="schedule.timezone"
              @update:model-value="setSchedule({ ...schedule, timezone: String($event) })"
            />
          </FormRow>
        </template>

        <p class="pt-4 text-sm text-muted">
          {{ t('access.saveHint', 'Availability and authentication are saved with the form. Tokens and the password take effect immediately.') }}
        </p>
      </div>
    </SectionCard>

    <SectionCard :title="t('access.tokensTitle', 'API tokens')">
      <div class="flex flex-col gap-4">
        <p class="text-sm text-muted">
          {{ t('access.tokensHint', 'Send a token as Authorization: Bearer TOKEN or in the x-form-token header. It is shown only once.') }}
        </p>
        <UAlert
          v-if="access.auth !== 'token'"
          color="neutral"
          variant="subtle"
          :title="t('access.tokensInactive', 'Tokens are only checked when authentication is set to API token.')"
        />

        <form
          class="flex gap-2"
          @submit.prevent="createToken"
        >
          <UInput
            v-model="tokenName"
            :placeholder="t('access.tokenName', 'Token name, e.g. Mobile app')"
            class="flex-1 sm:max-w-sm"
          />
          <UButton
            type="submit"
            :loading="creating"
            :disabled="!tokenName.trim()"
            :label="t('access.createToken', 'Create token')"
          />
        </form>

        <UAlert
          v-if="revealed"
          color="success"
          variant="subtle"
          :title="t('access.tokenCreated', 'Copy this token now. You will not see it again.')"
          :close="true"
          @update:open="revealed = undefined"
        >
          <template #description>
            <div class="mt-2 flex items-center gap-2">
              <code
                data-testid="revealed-token"
                class="break-all rounded bg-elevated px-2 py-1 text-xs"
              >{{ revealed.token }}</code>
              <UButton
                color="neutral"
                variant="outline"
                size="xs"
                icon="i-lucide-copy"
                :label="t('preview.copy', 'Copy')"
                @click="copy(revealed.token)"
              />
            </div>
          </template>
        </UAlert>

        <ul
          v-if="tokens?.length"
          class="divide-y divide-default rounded-md border border-default"
        >
          <li
            v-for="token in tokens"
            :key="token.id"
            class="flex items-center justify-between gap-3 p-3"
          >
            <div class="min-w-0">
              <p class="truncate font-medium">
                {{ token.name }}
                <StatusBadge
                  v-if="token.revokedAt"
                  status="revoked"
                  size="sm"
                  :label="t('access.revoked', 'Revoked')"
                  :colors="{ revoked: 'error' }"
                />
              </p>
              <p class="text-xs text-muted">
                <code>{{ token.prefix }}…</code>
                ·
                {{ token.lastUsedAt
                  ? t('access.lastUsed', 'Last used {date}', { date: format.dateTime(token.lastUsedAt) })
                  : t('access.neverUsed', 'Never used') }}
              </p>
            </div>
            <UButton
              v-if="!token.revokedAt"
              color="error"
              variant="outline"
              size="xs"
              :label="t('access.revoke', 'Revoke')"
              @click="revoke(token)"
            />
          </li>
        </ul>
        <p
          v-else
          class="text-sm text-muted"
        >
          {{ t('access.noTokens', 'No tokens yet.') }}
        </p>
      </div>
    </SectionCard>

    <SectionCard :title="t('access.passwordTitle', 'Shared password')">
      <div class="flex flex-col gap-4">
        <UAlert
          v-if="access.auth === 'password' && !passwordStatus?.set"
          color="warning"
          variant="subtle"
          :title="t('access.passwordMissing', 'No password is set, so nobody can open this form yet.')"
        />
        <FormRow
          :label="t('access.passwordLabel', 'Password')"
          :description="passwordHint"
        >
          <form
            class="flex flex-wrap gap-2"
            @submit.prevent="savePassword"
          >
            <UInput
              v-model="password"
              type="password"
              autocomplete="new-password"
              :placeholder="passwordStatus?.set ? t('access.newPassword', 'New password') : t('access.setPassword', 'Password (min. 6 characters)')"
              class="min-w-0 flex-1 sm:max-w-sm"
            />
            <UButton
              type="submit"
              :loading="savingPassword"
              :disabled="password.length < 6"
              :label="passwordStatus?.set ? t('access.changePassword', 'Change') : t('access.savePassword', 'Set password')"
            />
            <UButton
              v-if="passwordStatus?.set"
              type="button"
              color="error"
              variant="outline"
              :label="t('access.clearPassword', 'Clear')"
              @click="clearPassword"
            />
          </form>
        </FormRow>
      </div>
    </SectionCard>

    <SectionCard :title="t('access.apiTitle', 'API')">
      <div class="flex flex-col gap-4">
        <p class="text-sm text-muted">
          {{ t('access.apiHint', 'Submit with POST (JSON, or multipart with file:KEY parts). The definition is available with GET on /api/forms/{slug}.', { slug: props.slug }) }}
        </p>
        <div class="flex items-start gap-2">
          <pre class="flex-1 overflow-x-auto rounded-md bg-elevated p-3 text-xs">{{ snippet }}</pre>
          <UButton
            color="neutral"
            variant="outline"
            size="xs"
            icon="i-lucide-copy"
            :label="t('preview.copy', 'Copy')"
            @click="copy(snippet)"
          />
        </div>
      </div>
    </SectionCard>
  </div>
</template>
