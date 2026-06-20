<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '@/api'
import { useToast } from '@/composables/useToast'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'
import Label from '@/components/ui/Label.vue'
import {
  Plus, Trash2, Pencil, Check, X, Flag, Clock, Tag,
  AlertCircle, ChevronDown, Settings2, Bell
} from 'lucide-vue-next'

const { show } = useToast()

interface Task {
  id: string; title: string; description: string; category: string
  priority: 'low' | 'medium' | 'high' | 'critical'; status: 'todo' | 'in_progress' | 'done'
  deadline: string | null; remindBefore: number | null
  createdAt: string; completedAt: string | null
}
interface PlansData {
  tasks: Task[]; categories: string[]; settings: { remindInterval: number }
}

const data = ref<PlansData>({ tasks: [], categories: [], settings: { remindInterval: 30 } })
const tab = ref<'active' | 'done' | 'all'>('active')
const filterPriority = ref('')
const filterCategory = ref('')
const showForm = ref(false)
const editingId = ref<string | null>(null)
const showSettings = ref(false)
const newCategory = ref('')
const settingsInterval = ref(30)

const form = ref({
  title: '', description: '', category: '', priority: 'medium' as Task['priority'],
  deadline: '', remindBefore: null as number | null
})

const priorities = [
  { value: 'low',      label: 'Низкий',      color: 'text-muted-foreground',  bg: 'bg-muted',             border: 'border-border' },
  { value: 'medium',   label: 'Средний',     color: 'text-blue-500',          bg: 'bg-blue-500/10',        border: 'border-blue-500/30' },
  { value: 'high',     label: 'Высокий',     color: 'text-orange-500',        bg: 'bg-orange-500/10',      border: 'border-orange-500/30' },
  { value: 'critical', label: 'Критичный',   color: 'text-red-500',           bg: 'bg-red-500/10',         border: 'border-red-500/30' },
]
const remindOptions = [
  { label: 'Без напоминания', value: null },
  { label: 'За 15 минут', value: 15 },
  { label: 'За 30 минут', value: 30 },
  { label: 'За 1 час', value: 60 },
  { label: 'За 3 часа', value: 180 },
  { label: 'За 1 день', value: 1440 },
  { label: 'За 2 дня', value: 2880 },
]
const intervalOptions = [
  { label: 'Выключено', value: 0 },
  { label: 'Каждые 15 мин', value: 15 },
  { label: 'Каждые 30 мин', value: 30 },
  { label: 'Каждый час', value: 60 },
  { label: 'Каждые 3 часа', value: 180 },
]

function getPriority(p: string) { return priorities.find(x => x.value === p) || priorities[1] }

function formatDeadline(d: string | null) {
  if (!d) return null
  const date = new Date(d)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const days = Math.ceil(diff / 86400000)
  if (days < 0) return { label: `Просрочено на ${Math.abs(days)} д`, overdue: true }
  if (days === 0) return { label: 'Сегодня', urgent: true }
  if (days === 1) return { label: 'Завтра', urgent: true }
  return { label: `${days} дн`, overdue: false }
}

async function load() {
  const res = await api.get('/plans/tasks')
  data.value = res.data
  settingsInterval.value = res.data.settings.remindInterval
}

const filtered = computed(() => {
  let tasks = data.value.tasks
  if (tab.value === 'active') tasks = tasks.filter(t => t.status !== 'done')
  if (tab.value === 'done') tasks = tasks.filter(t => t.status === 'done')
  if (filterPriority.value) tasks = tasks.filter(t => t.priority === filterPriority.value)
  if (filterCategory.value) tasks = tasks.filter(t => t.category === filterCategory.value)
  // Сортировка: критичные → с дедлайном → остальные
  return [...tasks].sort((a, b) => {
    const pOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority]
    if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    if (a.deadline) return -1
    if (b.deadline) return 1
    return 0
  })
})

const counts = computed(() => ({
  active: data.value.tasks.filter(t => t.status !== 'done').length,
  done: data.value.tasks.filter(t => t.status === 'done').length,
}))

function openNew() {
  editingId.value = null
  form.value = { title: '', description: '', category: '', priority: 'medium', deadline: '', remindBefore: null }
  showForm.value = true
}

function openEdit(task: Task) {
  editingId.value = task.id
  form.value = {
    title: task.title, description: task.description, category: task.category,
    priority: task.priority, deadline: task.deadline?.slice(0, 16) || '',
    remindBefore: task.remindBefore
  }
  showForm.value = true
}

async function save() {
  if (!form.value.title.trim()) return
  const payload = { ...form.value, deadline: form.value.deadline || null }
  if (editingId.value) {
    await api.put(`/plans/tasks/${editingId.value}`, payload)
  } else {
    await api.post('/plans/tasks', payload)
  }
  showForm.value = false
  await load()
}

async function toggleStatus(task: Task) {
  const next = task.status === 'done' ? 'todo' : 'done'
  await api.put(`/plans/tasks/${task.id}`, { ...task, status: next })
  await load()
  if (next === 'done') show({ type: 'success', title: 'Выполнено!', message: task.title })
}

async function deleteTask(id: string) {
  await api.delete(`/plans/tasks/${id}`)
  data.value.tasks = data.value.tasks.filter(t => t.id !== id)
}

async function addCategory() {
  if (!newCategory.value.trim()) return
  const cats = [...data.value.categories, newCategory.value.trim()]
  await api.put('/plans/categories', { categories: cats })
  data.value.categories = cats
  newCategory.value = ''
}

async function removeCategory(cat: string) {
  const cats = data.value.categories.filter(c => c !== cat)
  await api.put('/plans/categories', { categories: cats })
  data.value.categories = cats
}

async function saveSettings() {
  await api.put('/plans/settings', { remindInterval: settingsInterval.value })
  data.value.settings.remindInterval = settingsInterval.value
  showSettings.value = false
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <h1 class="text-2xl font-bold">Планы</h1>
      <div class="flex gap-2">
        <Button variant="outline" size="icon" @click="showSettings = true" title="Настройки напоминаний">
          <Bell class="w-4 h-4" />
        </Button>
        <Button @click="openNew"><Plus class="w-4 h-4 mr-2" />Задача</Button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex border-b overflow-x-auto">
      <button v-for="[v, l, count] in [['active','Активные',counts.active],['done','Выполненные',counts.done],['all','Все',data.tasks.length]]"
        :key="v"
        :class="['px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 flex-shrink-0',
          tab === v ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground']"
        @click="tab = v as any">
        {{ l }}
        <span :class="['text-xs px-1.5 py-0.5 rounded-full', tab === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground']">{{ count }}</span>
      </button>
    </div>

    <!-- Filters -->
    <div class="flex gap-2">
      <select v-model="filterPriority" class="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm min-w-0">
        <option value="">Все приоритеты</option>
        <option v-for="p in priorities" :key="p.value" :value="p.value">{{ p.label }}</option>
      </select>
      <select v-model="filterCategory" class="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm min-w-0">
        <option value="">Все категории</option>
        <option v-for="c in data.categories" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>

    <!-- Task list -->
    <div class="space-y-2">
      <p v-if="filtered.length === 0" class="text-sm text-muted-foreground text-center py-12">
        {{ tab === 'done' ? 'Нет выполненных задач' : 'Нет задач. Создайте первую!' }}
      </p>

      <Card v-for="task in filtered" :key="task.id"
        :class="['p-4 flex gap-3 transition-opacity', task.status === 'done' ? 'opacity-60' : '']">
        <!-- Checkbox -->
        <button
          :class="['w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors',
            task.status === 'done' ? 'bg-primary border-primary' : 'border-muted-foreground hover:border-primary']"
          @click="toggleStatus(task)">
          <Check v-if="task.status === 'done'" class="w-3 h-3 text-primary-foreground" />
        </button>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-start gap-2 flex-wrap">
            <p :class="['text-sm font-medium', task.status === 'done' ? 'line-through text-muted-foreground' : '']">
              {{ task.title }}
            </p>
            <!-- Priority badge -->
            <span :class="['text-xs px-1.5 py-0.5 rounded-full border font-medium flex-shrink-0',
              getPriority(task.priority).bg, getPriority(task.priority).color, getPriority(task.priority).border]">
              {{ getPriority(task.priority).label }}
            </span>
          </div>
          <p v-if="task.description" class="text-xs text-muted-foreground mt-0.5 line-clamp-2">{{ task.description }}</p>

          <div class="flex items-center gap-3 mt-1.5 flex-wrap">
            <!-- Category -->
            <span v-if="task.category" class="flex items-center gap-1 text-xs text-muted-foreground">
              <Tag class="w-3 h-3" />{{ task.category }}
            </span>
            <!-- Deadline -->
            <span v-if="task.deadline" class="flex items-center gap-1 text-xs"
              :class="formatDeadline(task.deadline)?.overdue ? 'text-red-500 font-medium' : formatDeadline(task.deadline)?.urgent ? 'text-orange-500 font-medium' : 'text-muted-foreground'">
              <Clock class="w-3 h-3" />{{ formatDeadline(task.deadline)?.label }}
              <span v-if="task.remindBefore" class="text-muted-foreground">· 🔔</span>
            </span>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-start gap-1 flex-shrink-0">
          <button class="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground" @click="openEdit(task)">
            <Pencil class="w-3.5 h-3.5" />
          </button>
          <button class="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive" @click="deleteTask(task.id)">
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </Card>
    </div>
  </div>

  <!-- Task form modal -->
  <div v-if="showForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <Card class="w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-auto">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-lg">{{ editingId ? 'Редактировать' : 'Новая задача' }}</h2>
        <button @click="showForm = false"><X class="w-4 h-4 text-muted-foreground" /></button>
      </div>

      <div class="space-y-3">
        <div class="space-y-1"><Label>Название *</Label>
          <Input v-model="form.title" placeholder="Что нужно сделать?" @keyup.enter="save" /></div>

        <div class="space-y-1"><Label>Описание</Label>
          <textarea v-model="form.description" placeholder="Подробности..." rows="2"
            class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" /></div>

        <!-- Priority -->
        <div class="space-y-1"><Label>Приоритет</Label>
          <div class="grid grid-cols-4 gap-2">
            <button v-for="p in priorities" :key="p.value"
              :class="['py-1.5 rounded-lg text-xs font-medium border transition-colors',
                form.priority === p.value ? [p.bg, p.color, p.border] : 'bg-muted text-muted-foreground border-transparent hover:border-border']"
              @click="form.priority = p.value as any">{{ p.label }}</button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1"><Label>Категория</Label>
            <select v-model="form.category" class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Без категории</option>
              <option v-for="c in data.categories" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="space-y-1"><Label>Дедлайн</Label>
            <Input v-model="form.deadline" type="datetime-local" class="h-10" /></div>
        </div>

        <div class="space-y-1"><Label>Напомнить</Label>
          <select v-model="form.remindBefore" class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option v-for="o in remindOptions" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
      </div>

      <div class="flex gap-2 pt-1">
        <Button variant="outline" class="flex-1" @click="showForm = false">Отмена</Button>
        <Button class="flex-1" @click="save" :disabled="!form.title.trim()">Сохранить</Button>
      </div>
    </Card>
  </div>

  <!-- Settings modal -->
  <div v-if="showSettings" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <Card class="w-full max-w-sm p-6 space-y-5">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Bell class="w-4 h-4 text-muted-foreground" />
          <h2 class="font-semibold text-lg">Напоминания</h2>
        </div>
        <button @click="showSettings = false"><X class="w-4 h-4 text-muted-foreground" /></button>
      </div>

      <div class="space-y-2">
        <Label>Проверять задачи</Label>
        <select v-model="settingsInterval" class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option v-for="o in intervalOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <p class="text-xs text-muted-foreground">Как часто проверять задачи с дедлайном и показывать напоминания</p>
      </div>

      <!-- Categories -->
      <div class="space-y-2">
        <Label>Категории</Label>
        <div class="flex flex-wrap gap-1.5">
          <span v-for="cat in data.categories" :key="cat"
            class="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full">
            {{ cat }}
            <button @click="removeCategory(cat)" class="text-muted-foreground hover:text-destructive"><X class="w-2.5 h-2.5" /></button>
          </span>
        </div>
        <div class="flex gap-2">
          <Input v-model="newCategory" placeholder="Новая категория" class="h-8 text-sm" @keyup.enter="addCategory" />
          <Button size="sm" variant="outline" class="h-8" @click="addCategory" :disabled="!newCategory.trim()">
            <Plus class="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div class="flex gap-2">
        <Button variant="outline" class="flex-1" @click="showSettings = false">Отмена</Button>
        <Button class="flex-1" @click="saveSettings">Сохранить</Button>
      </div>
    </Card>
  </div>
</template>
