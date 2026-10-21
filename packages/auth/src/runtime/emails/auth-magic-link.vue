<script setup lang="ts">
defineProps<{
  name: string
  url: string
}>()
</script>

<template>
  <EHtml>
    <EHead />
    <EBody style="background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
      <EContainer style="background-color: #ffffff; margin: 24px auto; padding: 32px">
        <ESubject>Your sign-in link</ESubject>
        <ESection>
          <EText style="font-size: 16px; line-height: 24px">
            Hi {{ name }},
          </EText>
          <EText style="font-size: 16px; line-height: 24px">
            Click the button below to sign in. It can be used once and expires in 2 hours.
          </EText>
          <EButton
            :href="url"
            style="background-color: #111827; border-radius: 6px; color: #ffffff; font-size: 16px; padding: 12px 20px"
          >
            Sign in
          </EButton>
          <EText style="color: #6b7280; font-size: 14px; line-height: 20px">
            Or open this link: <ELink :href="url">
              {{ url }}
            </ELink>
          </EText>
        </ESection>
      </EContainer>
    </EBody>
  </EHtml>
</template>
