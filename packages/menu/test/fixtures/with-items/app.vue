<template>
  <ul>
    <li
      v-for="item in main"
      :key="item.id"
    >
      {{ item.label }} -> {{ item.to }}
    </li>
  </ul>
  <ul>
    <li
      v-for="item in more"
      :key="item.id"
    >
      {{ item.label }} -> {{ item.to }}
    </li>
  </ul>
  <div
    v-if="refilter"
    id="refilter"
  >
    <p>before: {{ before.map(item => item.label).join(',') }}</p>
    <p>after: {{ after.map(item => item.label).join(',') }}</p>
  </div>
  <ul id="staff">
    <li
      v-for="item in staff"
      :key="item.id"
    >
      {{ item.label }}
    </li>
  </ul>
</template>

<script setup>
const { data: main } = useMenu('dashboard')
const { data: more } = useMenu('dashboard.more')
const { data: staff } = useMenu('staff')

// `/?refilter`: the same menu resolved before and after the viewer's permissions change (sign-in as admin) and the
// access version bumps.
const refilter = 'refilter' in useRoute().query
let before = []
let after = []
if (refilter) {
  before = (await useMenu('staff')).data.value
  useState('test:permissions').value = ['admin:access']
  useState('access:version').value++
  after = (await useMenu('staff')).data.value
}
</script>
