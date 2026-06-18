<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'

const route = useRoute()

// Apply saved theme
if (localStorage.getItem('theme') === 'dark') {
  document.documentElement.classList.add('dark')
}
</script>

<template>
  <AppLayout v-if="route.meta.requiresAuth">
    <RouterView />
  </AppLayout>
  <RouterView v-else />
</template>
