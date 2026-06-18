<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLockStore } from '@/stores/lock'
import MiniPlayer from '@/components/MiniPlayer.vue'
import LockScreen from '@/components/LockScreen.vue'
import {
  BookOpen, Wallet, Music, Apple, GraduationCap, Settings,
  Menu, X, Moon, Sun, ChevronLeft, ChevronRight, Lock
} from 'lucide-vue-next'

const route = useRoute()
const auth = useAuthStore()
const lock = useLockStore()
const mobileOpen = ref(false)
const collapsed = ref(localStorage.getItem('sidebar-collapsed') === 'true')
const dark = ref(document.documentElement.classList.contains('dark'))

function toggleDark() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('dark', dark.value)
  localStorage.setItem('theme', dark.value ? 'dark' : 'light')
}

function toggleCollapse() {
  collapsed.value = !collapsed.value
  localStorage.setItem('sidebar-collapsed', String(collapsed.value))
}

const navItems = [
  { to: '/journal', label: 'Дневник', icon: BookOpen },
  { to: '/finance', label: 'Финансы', icon: Wallet },
  { to: '/music', label: 'Плеер', icon: Music },
  { to: '/diet', label: 'Диета', icon: Apple },
  { to: '/study', label: 'Учёба', icon: GraduationCap },
]

onMounted(() => {
  if (auth.isAuthenticated) lock.setupActivity()
})
</script>

<template>
  <div class="flex h-screen bg-background overflow-hidden">
    <LockScreen />

    <!-- Mobile overlay -->
    <div v-if="mobileOpen" class="fixed inset-0 z-20 bg-black/50 lg:hidden" @click="mobileOpen = false" />

    <!-- Sidebar -->
    <aside :class="[
      'fixed lg:static inset-y-0 left-0 z-30 flex flex-col border-r bg-card transition-all duration-200 overflow-hidden',
      mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      collapsed ? 'w-14' : 'w-56'
    ]">
      <!-- Logo + collapse toggle -->
      <div class="flex items-center h-14 border-b flex-shrink-0" :class="collapsed ? 'justify-center px-0' : 'px-4 justify-between'">
        <span v-if="!collapsed" class="font-bold text-lg truncate">MemoReals</span>
        <button class="lg:hidden p-1" v-if="!collapsed" @click="mobileOpen = false"><X class="w-4 h-4" /></button>
        <button
          class="hidden lg:flex p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
          @click="toggleCollapse"
          :title="collapsed ? 'Развернуть' : 'Свернуть'"
        >
          <ChevronLeft v-if="!collapsed" class="w-4 h-4" />
          <ChevronRight v-else class="w-4 h-4" />
        </button>
      </div>

      <!-- Nav -->
      <nav class="flex-1 p-2 space-y-0.5 overflow-y-auto">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          @click="mobileOpen = false"
          :title="collapsed ? item.label : undefined"
          :class="[
            'flex items-center gap-3 px-2.5 py-2 rounded-md text-sm font-medium transition-colors',
            collapsed ? 'justify-center' : '',
            route.path.startsWith(item.to)
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          ]"
        >
          <component :is="item.icon" class="w-4 h-4 flex-shrink-0" />
          <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <!-- Bottom actions -->
      <div class="p-2 border-t space-y-0.5">
        <div v-if="!collapsed" class="px-2.5 py-1.5 text-xs text-muted-foreground truncate">{{ auth.username }}</div>

        <!-- Lock -->
        <button v-if="lock.hasPin"
          :title="collapsed ? 'Заблокировать' : undefined"
          :class="['flex items-center gap-3 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground w-full transition-colors', collapsed ? 'justify-center' : '']"
          @click="lock.lock()"
        >
          <Lock class="w-4 h-4 flex-shrink-0" />
          <span v-if="!collapsed">Заблокировать</span>
        </button>

        <!-- Settings -->
        <RouterLink to="/settings" @click="mobileOpen = false"
          :title="collapsed ? 'Настройки' : undefined"
          :class="[
            'flex items-center gap-3 px-2.5 py-2 rounded-md text-sm font-medium transition-colors',
            collapsed ? 'justify-center' : '',
            route.path === '/settings'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          ]">
          <Settings class="w-4 h-4 flex-shrink-0" />
          <span v-if="!collapsed">Настройки</span>
        </RouterLink>

        <!-- Theme -->
        <button
          :title="collapsed ? (dark ? 'Светлая тема' : 'Тёмная тема') : undefined"
          :class="['flex items-center gap-3 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground w-full transition-colors', collapsed ? 'justify-center' : '']"
          @click="toggleDark"
        >
          <Moon v-if="!dark" class="w-4 h-4 flex-shrink-0" />
          <Sun v-else class="w-4 h-4 flex-shrink-0" />
          <span v-if="!collapsed">{{ dark ? 'Светлая тема' : 'Тёмная тема' }}</span>
        </button>
      </div>
    </aside>

    <!-- Main -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <header class="h-14 border-b flex items-center px-4 gap-3 bg-card lg:hidden">
        <button @click="mobileOpen = true"><Menu class="w-5 h-5" /></button>
        <span class="font-semibold">MemoReals</span>
      </header>
      <main class="flex-1 overflow-auto p-4 md:p-6">
        <slot />
      </main>
      <MiniPlayer v-if="route.path !== '/music'" />
    </div>
  </div>
</template>
