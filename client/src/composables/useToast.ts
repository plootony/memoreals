import { ref } from 'vue'

export interface Toast {
  id: string
  title: string
  message?: string
  type: 'info' | 'warning' | 'success' | 'error'
  duration?: number
}

const toasts = ref<Toast[]>([])

export function useToast() {
  function show(toast: Omit<Toast, 'id'>) {
    const id = Math.random().toString(36).slice(2)
    toasts.value.push({ ...toast, id })
    setTimeout(() => dismiss(id), toast.duration ?? 5000)
  }

  function dismiss(id: string) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return { toasts, show, dismiss }
}
