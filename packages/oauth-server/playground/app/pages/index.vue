<template>
  <UContainer class="py-10">
    <h1 class="mb-4 text-2xl font-semibold">
      oauth-server playground
    </h1>
    <ul class="list-inside list-disc space-y-1">
      <li><NuxtLink to="/sign-up">Sign up</NuxtLink> (use <code>admin@example.com</code> to become an admin, <code>member@example.com</code> for the member role)</li>
      <li><NuxtLink to="/admin/oauth">Manage applications</NuxtLink></li>
      <li><NuxtLink to="/account/applications">My applications</NuxtLink></li>
      <li><a href="/.well-known/openid-configuration">Discovery document</a></li>
    </ul>
  </UContainer>
</template>
