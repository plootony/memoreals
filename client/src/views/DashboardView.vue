<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import Card from '@/components/ui/Card.vue'
import {
  BookOpen, Wallet, Apple, GraduationCap, ListTodo,
  TrendingUp, TrendingDown, Scale, ChevronRight, Clock
} from 'lucide-vue-next'

const router = useRouter()

const journal = ref<any[]>([])
const balance = ref({ totalIncome: 0, totalExpense: 0, balance: 0 })
const weightData = ref<{ log: any[]; goal: number | null }>({ log: [], goal: null })
const dietLog = ref<any[]>([])
const dietGoals = ref({ calories: 2000 })
const tasks = ref<any[]>([])

const today = new Date().toISOString().slice(0, 10)

onMounted(async () => {
  const results = await Promise.allSettled([
    api.get('/journal'),
    api.get('/finance/stats'),
    api.get('/diet/weight'),
    api.get('/diet/log', { params: { date: today } }),
    api.get('/diet/goals'),
    api.get('/plans/tasks'),
  ])
  if (results[0].status === 'fulfilled') journal.value = results[0].value.data
  if (results[1].status === 'fulfilled') balance.value = results[1].value.data
  if (results[2].status === 'fulfilled') weightData.value = results[2].value.data
  if (results[3].status === 'fulfilled') dietLog.value = results[3].value.data
  if (results[4].status === 'fulfilled') dietGoals.value = results[4].value.data
  if (results[5].status === 'fulfilled') tasks.value = results[5].value.data.tasks || []
})

const lastEntry = computed(() => journal.value[0] || null)
const currentWeight = computed(() => weightData.value.log.at(-1)?.weight ?? null)
const startWeight = computed(() => weightData.value.log[0]?.weight ?? null)
const weightDiff = computed(() => currentWeight.value && startWeight.value
  ? Math.round((currentWeight.value - startWeight.value) * 10) / 10 : null)

const todayCalories = computed(() => dietLog.value.reduce((s, e) => s + e.calories, 0))
const calPct = computed(() => Math.min(100, Math.round(todayCalories.value / dietGoals.value.calories * 100)))

const activeTasks = computed(() => tasks.value.filter(t => t.status !== 'done'))
const urgentTasks = computed(() => activeTasks.value.filter(t => {
  if (!t.deadline) return false
  const diff = new Date(t.deadline).getTime() - Date.now()
  return diff > 0 && diff < 86400000 * 2
}))
const overdueTasks = computed(() => activeTasks.value.filter(t => t.deadline && new Date(t.deadline) < new Date()))

const priorityColor: Record<string, string> = {
  critical: 'text-red-500', high: 'text-orange-500', medium: 'text-blue-500', low: 'text-muted-foreground'
}

function stripHtml(html: string) { return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) }
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Главная</h1>
        <p class="text-sm text-muted-foreground">{{ new Date().toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' }) }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

      <!-- Tasks -->
      <Card class="p-4 cursor-pointer hover:bg-accent/30 transition-colors sm:col-span-2 xl:col-span-1" @click="router.push('/plans')">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <ListTodo class="w-4 h-4 text-violet-500" />
            <span class="text-sm font-semibold">Задачи</span>
          </div>
          <ChevronRight class="w-4 h-4 text-muted-foreground" />
        </div>
        <div class="flex gap-4 mb-3">
          <div class="text-center">
            <p class="text-2xl font-bold">{{ activeTasks.length }}</p>
            <p class="text-xs text-muted-foreground">активных</p>
          </div>
          <div v-if="overdueTasks.length" class="text-center">
            <p class="text-2xl font-bold text-red-500">{{ overdueTasks.length }}</p>
            <p class="text-xs text-muted-foreground">просрочено</p>
          </div>
          <div v-if="urgentTasks.length" class="text-center">
            <p class="text-2xl font-bold text-orange-500">{{ urgentTasks.length }}</p>
            <p class="text-xs text-muted-foreground">горят</p>
          </div>
        </div>
        <div class="space-y-1.5">
          <div v-for="task in activeTasks.slice(0, 3)" :key="task.id" class="flex items-center gap-2">
            <div :class="['w-1.5 h-1.5 rounded-full flex-shrink-0', task.priority === 'critical' ? 'bg-red-500' : task.priority === 'high' ? 'bg-orange-500' : 'bg-blue-500']" />
            <p class="text-xs truncate flex-1">{{ task.title }}</p>
            <span v-if="task.deadline" class="text-xs text-muted-foreground flex-shrink-0 flex items-center gap-0.5">
              <Clock class="w-2.5 h-2.5" />
              {{ new Date(task.deadline).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) }}
            </span>
          </div>
          <p v-if="activeTasks.length === 0" class="text-xs text-muted-foreground text-center py-1">Все задачи выполнены 🎉</p>
        </div>
      </Card>

      <!-- Finance -->
      <Card class="p-4 cursor-pointer hover:bg-accent/30 transition-colors" @click="router.push('/finance')">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <Wallet class="w-4 h-4 text-green-500" />
            <span class="text-sm font-semibold">Финансы</span>
          </div>
          <ChevronRight class="w-4 h-4 text-muted-foreground" />
        </div>
        <p :class="['text-2xl font-bold', balance.balance >= 0 ? 'text-green-500' : 'text-red-500']">
          {{ formatCurrency(balance.balance) }}
        </p>
        <p class="text-xs text-muted-foreground mb-2">баланс</p>
        <div class="flex gap-3 text-xs">
          <span class="flex items-center gap-1 text-green-500"><TrendingUp class="w-3 h-3" />{{ formatCurrency(balance.totalIncome) }}</span>
          <span class="flex items-center gap-1 text-red-500"><TrendingDown class="w-3 h-3" />{{ formatCurrency(balance.totalExpense) }}</span>
        </div>
      </Card>

      <!-- Weight -->
      <Card class="p-4 cursor-pointer hover:bg-accent/30 transition-colors" @click="router.push('/diet')">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <Scale class="w-4 h-4 text-purple-500" />
            <span class="text-sm font-semibold">Вес</span>
          </div>
          <ChevronRight class="w-4 h-4 text-muted-foreground" />
        </div>
        <div v-if="currentWeight">
          <p class="text-2xl font-bold">{{ currentWeight }} <span class="text-base font-normal text-muted-foreground">кг</span></p>
          <p v-if="weightDiff !== null" :class="['text-xs mt-0.5', weightDiff < 0 ? 'text-green-500' : weightDiff > 0 ? 'text-orange-500' : 'text-muted-foreground']">
            {{ weightDiff > 0 ? '+' : '' }}{{ weightDiff }} кг от начала
          </p>
          <div v-if="weightData.goal" class="mt-2">
            <div class="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Цель {{ weightData.goal }} кг</span>
              <span>{{ Math.abs(Math.round((currentWeight - weightData.goal) * 10) / 10) }} кг осталось</span>
            </div>
            <div class="h-1.5 rounded-full bg-muted overflow-hidden">
              <div class="h-full rounded-full bg-purple-500 transition-all"
                :style="`width: ${Math.min(100, Math.round(Math.abs(startWeight! - currentWeight) / Math.abs(startWeight! - weightData.goal) * 100))}%`" />
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-muted-foreground">Нет замеров</p>
      </Card>

      <!-- Diet today -->
      <Card class="p-4 cursor-pointer hover:bg-accent/30 transition-colors" @click="router.push('/diet')">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <Apple class="w-4 h-4 text-orange-500" />
            <span class="text-sm font-semibold">Питание сегодня</span>
          </div>
          <ChevronRight class="w-4 h-4 text-muted-foreground" />
        </div>
        <p class="text-2xl font-bold">{{ todayCalories }} <span class="text-base font-normal text-muted-foreground">/ {{ dietGoals.calories }}</span></p>
        <p class="text-xs text-muted-foreground mb-2">ккал</p>
        <div class="h-2 rounded-full bg-muted overflow-hidden">
          <div :class="['h-full rounded-full transition-all', calPct > 100 ? 'bg-red-500' : 'bg-orange-500']"
            :style="`width: ${calPct}%`" />
        </div>
        <p class="text-xs text-muted-foreground mt-1">{{ calPct }}%{{ dietLog.length ? ` · ${dietLog.length} приём(ов)` : '' }}</p>
      </Card>

      <!-- Journal -->
      <Card class="p-4 cursor-pointer hover:bg-accent/30 transition-colors sm:col-span-2 xl:col-span-1" @click="router.push('/journal')">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <BookOpen class="w-4 h-4 text-blue-500" />
            <span class="text-sm font-semibold">Дневник</span>
          </div>
          <ChevronRight class="w-4 h-4 text-muted-foreground" />
        </div>
        <template v-if="lastEntry">
          <p class="text-sm font-medium truncate">{{ lastEntry.title || 'Без названия' }}</p>
          <p class="text-xs text-muted-foreground mt-0.5 mb-2">{{ formatDate(lastEntry.date) }}</p>
          <p class="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{{ stripHtml(lastEntry.content) }}</p>
        </template>
        <p v-else class="text-sm text-muted-foreground">Нет записей</p>
      </Card>

      <!-- Study last -->
      <Card class="p-4 cursor-pointer hover:bg-accent/30 transition-colors" @click="router.push('/study')">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <GraduationCap class="w-4 h-4 text-green-500" />
            <span class="text-sm font-semibold">Учёба</span>
          </div>
          <ChevronRight class="w-4 h-4 text-muted-foreground" />
        </div>
        <p class="text-xs text-muted-foreground">Перейти к конспектам →</p>
      </Card>

    </div>
  </div>
</template>
