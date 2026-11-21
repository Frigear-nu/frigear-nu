<template>
  <div class="flex flex-col gap-4 p-4">
    <h1>Home</h1>
    <Dashboard
      name="crew.home"
      :context="{ who: 'volunteer' }"
    />
  </div>
</template>
