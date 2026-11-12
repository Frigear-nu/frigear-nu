<script setup lang="ts">
import { documentLabel, visibleDocuments } from '../utils/documents'
import { computed, useModuleT, useNuxtApp, useRuntimeConfig } from '#imports'
import { useAuthorization } from '#account/optional'

defineOptions({ name: 'AccountDocumentsPage' })

const t = useModuleT('account.documents')
// `@frigear-nu/authorization` is optional: without it documents with a `permission` are not listed.
const authorization = typeof useAuthorization === 'function' ? useAuthorization() : undefined
const nuxtApp = useNuxtApp() as { $i18n?: { locale?: { value?: string } } }
const locale = computed(() => nuxtApp.$i18n?.locale?.value ?? 'en')

const documents = computed(() =>
  visibleDocuments(useRuntimeConfig().public.account?.documents ?? [], authorization ? permission => authorization.can(permission) : undefined))
</script>

<template>
  <div class="flex flex-col gap-4">
    <AccountHeader />

    <SectionCard flush>
      <ul
        v-if="documents.length"
        class="divide-y divide-default"
      >
        <li
          v-for="document in documents"
          :key="document.id"
          class="flex items-center gap-3 px-4 py-3"
        >
          <UIcon
            :name="document.icon ?? 'i-lucide-file'"
            class="size-5 shrink-0 text-muted"
          />
          <p class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">
            {{ documentLabel(document, locale) }}
          </p>
          <UButton
            download
            external
            :to="document.path"
            color="neutral"
            variant="outline"
            icon="i-lucide-download"
            :label="t('download', 'Download')"
            :aria-label="t('downloadNamed', 'Download {name}', { name: documentLabel(document, locale) })"
          />
        </li>
      </ul>
      <UEmpty
        v-else
        variant="naked"
        icon="i-lucide-files"
        :title="t('empty', 'No documents for you yet.')"
      />
    </SectionCard>
  </div>
</template>
