<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import { Search, BookOpen, ListTodo, GraduationCap, Wallet, X, Loader2 } from 'lucide-vue-next'

const emit = defineEmits(['close'])
const router = useRouter()

const query = ref('')
const loading = ref(false)
const inputRef = ref<HTMLInputElement>()
const results = ref<Record<string, { id: string; title: string; subtitle: string; section: string }[]>>({
  journal: [], plans: [], study: [], finance: []
})

const sectionMeta: Record<string, { label: string; icon: any; route: string; color: string }> = {
  journal: { label: 'Дневник',  icon: BookOpen,      route: '/journal', color: 'text-blue-500' },
  plans:   { label: 'Планы',    icon: ListTodo,       route: '/plans',   color: 'text-violet-500' },
  study:   { label: 'Учёба',    icon: GraduationCap,  route: '/study',   color: 'text-green-500' },
  finance: { label: 'Финансы',  icon: Wallet,         route: '/finance', color: 'text-orange-500' },
}

const hasResults = () => Object.values(results.value).some(r => r.length > 0)

let searchTimer: any
watch(query, v => {
  clearTimeout(searchTimer)
  if (!v.trim()) { results.value = { journal: [], plans: [], study: [], finance: [] }; return }
  searchTimer = setTimeout(async () => {
    loading.value = true
    try {
      const res = await api.get('/search', { params: { q: v.trim() } })
      results.value = res.data
    } finally {
      loading.value = false
    }
  }, 300)
})

function go(route: string) {
  router.push(route)
  emit('close')
}

nextTick(() => inputRef.value?.focus())
</script>

<template>
  <div class="fixed inset-0 z-[9990] flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-sm"
    @click.self="$emit('close')">
    <div class="w-full max-w-lg bg-card rounded-2xl shadow-2xl border overflow-hidden">
      <!-- Input -->
      <div class="flex items-center gap-3 px-4 py-3 border-b">
        <Search class="w-5 h-5 text-muted-foreground flex-shrink-0" />
        <input ref="inputRef" v-model="query" placeholder="Поиск по всему приложению..."
          class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          @keyup.escape="$emit('close')" />
        <Loader2 v-if="loading" class="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
        <button v-else-if="query" @click="query = ''" class="text-muted-foreground hover:text-foreground">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Results -->
      <div class="max-h-[60vh] overflow-auto">
        <template v-if="query && hasResults()">
          <div v-for="(items, section) in results" :key="section">
            <template v-if="items.length">
              <!-- Section header -->
              <div class="flex items-center gap-2 px-4 py-2 bg-muted/40">
                <component :is="sectionMeta[section].icon" :class="['w-3.5 h-3.5', sectionMeta[section].color]" />
                <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {{ sectionMeta[section].label }}
                </span>
              </div>
              <!-- Items -->
              <button v-for="item in items" :key="item.id"
                class="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-accent transition-colors text-left"
                @click="go(sectionMeta[section].route)">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{{ item.title }}</p>
                  <p v-if="item.subtitle" class="text-xs text-muted-foreground truncate">{{ item.subtitle }}</p>
                </div>
              </button>
            </template>
          </div>
        </template>

        <div v-else-if="query && !loading" class="py-10 text-center text-sm text-muted-foreground">
          Ничего не найдено по «{{ query }}»
        </div>
        <div v-else-if="!query" class="py-6 text-center text-xs text-muted-foreground">
          Начните вводить запрос
        </div>
      </div>
    </div>
  </div>
</template>
