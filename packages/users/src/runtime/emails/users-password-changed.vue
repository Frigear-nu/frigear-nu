<script setup lang="ts">
defineProps<{
  name: string
}>()
</script>

<template>
  <EHtml>
    <EHead />
    <EBody style="background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
      <EContainer style="background-color: #ffffff; margin: 24px auto; padding: 32px">
        <ESubject>Your password was changed</ESubject>
        <ESection>
          <EText style="font-size: 16px; line-height: 24px">
            Hi {{ name }},
          </EText>
          <EText style="font-size: 16px; line-height: 24px">
            The password on your account was just changed. If this wasn't you, reset it right away.
          </EText>
        </ESection>
      </EContainer>
    </EBody>
  </EHtml>
</template>
