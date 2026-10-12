<script setup lang="ts">
import { documentLabel, visibleDocuments } from '../utils/documents'

defineOptions({ name: 'AccountDocumentsPage' })

const t = useModuleT('account.documents')
const { user } = useUserSession()
const nuxtApp = useNuxtApp() as { $i18n?: { locale?: { value?: string } } }
const locale = computed(() => nuxtApp.$i18n?.locale?.value ?? 'en')

const documents = computed(() =>
  visibleDocuments(useRuntimeConfig().public.account?.documents ?? [], (user.value as { role?: string } | null)?.role))
</script>

<template>
  <UContainer>
    <UPage>
      <UPageBody>
        <UPageGrid v-if="documents.length">
          <UPageCard
            v-for="document in documents"
            :key="document.id"
            :title="documentLabel(document, locale)"
            :icon="document.icon ?? 'i-lucide-file'"
          >
            <UButton
              download
              external
              :to="document.path"
              icon="i-lucide-download"
              :label="t('download', 'Download')"
            />
          </UPageCard>
        </UPageGrid>
        <UEmpty
          v-else
          :title="t('empty', 'No documents for you yet.')"
        />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
