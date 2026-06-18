<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import { X, Bell, AlertTriangle, CheckCircle, Info } from 'lucide-vue-next'

const { toasts, dismiss } = useToast()

const icons = { info: Info, warning: AlertTriangle, success: CheckCircle, error: AlertTriangle }
const colors = {
  info:    'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  warning: 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400',
  success: 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
  error:   'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[9998] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      <TransitionGroup name="toast">
        <div v-for="t in toasts" :key="t.id"
          :class="['flex items-start gap-3 p-3.5 rounded-xl border shadow-lg bg-card backdrop-blur-sm', colors[t.type]]">
          <component :is="icons[t.type]" class="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-foreground leading-tight">{{ t.title }}</p>
            <p v-if="t.message" class="text-xs text-muted-foreground mt-0.5 leading-snug">{{ t.message }}</p>
          </div>
          <button @click="dismiss(t.id)" class="text-muted-foreground hover:text-foreground flex-shrink-0">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active { transition: all 0.25s ease-out; }
.toast-leave-active { transition: all 0.2s ease-in; }
.toast-enter-from  { opacity: 0; transform: translateX(100%); }
.toast-leave-to    { opacity: 0; transform: translateX(100%); }
</style>
