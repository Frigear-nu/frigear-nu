<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { ShortLinkDto } from '../../../types'
import { shortLinksApi } from '../../utils/api'
import { VANITY_CODE_PATTERN, normalizeShortLinkTarget, shortLinkName } from '../../utils/codes'
import { $fetch, reactive, useAction, useModuleT, useRuntimeConfig } from '#imports'

defineOptions({ name: 'ShortLinkFormSlideover' })

// Create and edit form of a link made by hand, opened with `useOverlay()` by `useShortLinkActions()`: it closes with
// the saved link, or `false` when cancelled. Links other modules own never reach it (they are read-only here).
const props = defineProps<{ link?: ShortLinkDto }>()
const emit = defineEmits<{ close: [saved: ShortLinkDto | false] }>()

const t = useModuleT('shortLinks')
const { busy, run } = useAction()
const publicConfig = useRuntimeConfig().public.shortLinks
const path = publicConfig?.path ?? '/l'
const deleteAfterDays = publicConfig?.deleteAfterDays ?? 30

/** `YYYY-MM-DDTHH:mm` in local time, what `<input type="datetime-local">` holds. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const schema = z.object({
  url: z.string().trim().refine(value => !!normalizeShortLinkTarget(value), t('admin.form.urlInvalid', 'Enter a full http:// or https:// address')),
  code: z.string().trim().refine(value => !value || VANITY_CODE_PATTERN.test(value), t('admin.form.codeInvalid', '3 to 64 letters, digits, dashes or underscores')),
  title: z.string().trim().max(200),
  expiresAt: z.string(),
  autoDelete: z.boolean(),
  track: z.boolean(),
})
type State = z.output<typeof schema>

const state = reactive<State>({
  url: props.link?.url ?? '',
  code: props.link?.code ?? '',
  title: props.link?.title ?? '',
  expiresAt: toLocalInput(props.link?.expiresAt),
  autoDelete: props.link?.autoDelete ?? false,
  track: props.link?.track ?? true,
})

async function save(event: FormSubmitEvent<State>) {
  const { url, code, title, expiresAt, autoDelete, track } = event.data
  const body = {
    url,
    // A new link without a code gets a random one; an existing link always has one.
    ...(code || props.link ? { code } : {}),
    title: title || null,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    autoDelete,
    track,
  }
  const saved = await run(
    () => props.link
      ? $fetch<ShortLinkDto>(shortLinksApi.admin.link(props.link.id), { method: 'PATCH', body })
      : $fetch<ShortLinkDto>(shortLinksApi.admin.links, { method: 'POST', body }),
    {
      success: props.link
        ? t('admin.saved', 'Saved {name}', { name: shortLinkName({ title: title || null, code: code || props.link.code }) })
        : t('admin.created', 'Created {name}', { name: title || code || t('admin.newLink', 'the short link') }),
      error: t('admin.saveFailed', 'Could not save the short link'),
    },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="short-link-form"
    :title="link ? t('admin.editTitle', 'Edit short link') : t('admin.create', 'Create short link')"
    :description="link ? undefined : t('admin.createDescription', 'A short address that sends people on to a longer one.')"
    :submit-label="link ? t('admin.saveAction', 'Save short link') : t('admin.createAction', 'Create short link')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="short-link-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="url"
        :label="t('admin.form.url', 'Target')"
        :description="t('admin.form.urlHelp', 'Where the short link sends people.')"
        required
      >
        <UInput
          v-model="state.url"
          type="url"
          placeholder="https://"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="code"
        :label="t('admin.form.code', 'Code')"
        :description="link
          ? t('admin.form.codeEditHelp', 'Changing it breaks the old short link.')
          : t('admin.form.codeHelp', 'Leave empty for a random code. Letters, digits, dashes and underscores.')"
      >
        <UInput
          v-model="state.code"
          class="w-full"
        >
          <template #leading>
            <span class="text-sm text-muted">{{ path }}/</span>
          </template>
        </UInput>
      </UFormField>
      <UFormField
        name="title"
        :label="t('admin.form.title', 'Title')"
        :description="t('admin.form.titleHelp', 'Only staff see it, to tell links apart.')"
      >
        <UInput
          v-model="state.title"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="expiresAt"
        :label="t('admin.form.expiresAt', 'Expires')"
        :description="t('admin.form.expiresAtHelp', 'After this the link answers \'not found\'. Leave empty to keep it working.')"
      >
        <UInput
          v-model="state.expiresAt"
          type="datetime-local"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="autoDelete"
        :description="t('admin.form.autoDeleteHelp', 'Delete the link and its clicks {days} days after it expires or is disabled.', { days: deleteAfterDays })"
      >
        <USwitch
          v-model="state.autoDelete"
          :label="t('admin.form.autoDelete', 'Delete when no longer needed')"
        />
      </UFormField>
      <UFormField
        name="track"
        :description="t('admin.form.trackHelp', 'Keep a row per click (time and referring site, never the IP address). The click count is kept either way.')"
      >
        <USwitch
          v-model="state.track"
          :label="t('admin.form.track', 'Record each click')"
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
