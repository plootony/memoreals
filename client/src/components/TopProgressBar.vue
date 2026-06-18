<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const visible = ref(false)
const width = ref(0)
let timer: ReturnType<typeof setTimeout> | null = null

const router = useRouter()

router.beforeEach(() => {
  width.value = 0
  visible.value = true
  // Анимируем до 85% — оставшиеся 15% дожидаемся реального завершения
  timer = setTimeout(() => { width.value = 85 }, 50)
})

router.afterEach(() => {
  if (timer) clearTimeout(timer)
  width.value = 100
  setTimeout(() => { visible.value = false; width.value = 0 }, 300)
})
</script>

<template>
  <div v-if="visible"
    class="fixed top-0 left-0 z-[9999] h-0.5 bg-primary transition-all duration-300 ease-out pointer-events-none"
    :style="{ width: width + '%' }"
  />
</template>
