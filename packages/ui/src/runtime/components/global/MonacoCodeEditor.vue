<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(defineProps<{
  language?: string
  height?: string
  fullscreen?: boolean
}>(), {
  language: 'typescript',
  height: '160px',
  fullscreen: true,
})

const modelValue = defineModel<string>()

const isModalOpen = ref(false)

const editorOptions = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 13,
  tabSize: 2,
  theme: 'vs-dark',
}

const slotName = computed(() => {
  return props.fullscreen ? 'body' : 'content'
})
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="relative">
      <MonacoEditor
        v-model="modelValue"
        :lang="language"
        :options="editorOptions"
        class="rounded-md overflow-hidden border border-default"
        :style="{ height }"
      >
        <div
          class="rounded-md border border-default bg-muted animate-pulse"
          :style="{ height }"
        />
      </MonacoEditor>
      <UButton
        v-if="!isModalOpen"
        size="xs"
        variant="ghost"
        icon="i-lucide-expand"
        class="absolute top-1 right-1 z-10 opacity-70 hover:opacity-100"
        title="Expand editor"
        @click="isModalOpen = true"
      />
    </div>

    <UModal
      v-model:open="isModalOpen"
      title="Code Editor"
      :fullscreen="fullscreen"
      :ui="{ footer: 'justify-end' }"
    >
      <template #[slotName]>
        <MonacoEditor
          v-model="modelValue"
          :lang="language"
          :options="editorOptions"
          class="rounded-md overflow-hidden border border-default"
          :style="{
            height: fullscreen ? 'calc(100vh - 200px)' : '480px',
          }"
        />
        <div v-if="slotName === 'content'">
          <div class="flex justify-end">
            <UButton @click="isModalOpen = false">
              Close
            </UButton>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton @click="isModalOpen = false">
          Close
        </UButton>
      </template>
    </UModal>
  </div>
</template>
