<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend
} from 'chart.js'
import api from '@/api'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import { Plus, Trash2 } from 'lucide-vue-next'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

interface MeasurementEntry {
  id: string
  date: string
  note: string
  values: Partial<Record<string, number>>
}

const measurementFields = [
  { key: 'waist',      label: 'Талия',        color: '#f97316' },
  { key: 'chest',      label: 'Грудь',        color: '#3b82f6' },
  { key: 'hips',       label: 'Бёдра',        color: '#a855f7' },
  { key: 'leftArm',    label: 'Рука (лев.)',   color: '#22c55e' },
  { key: 'rightArm',   label: 'Рука (прав.)',  color: '#84cc16' },
  { key: 'leftThigh',  label: 'Бедро (лев.)',  color: '#ef4444' },
  { key: 'rightThigh', label: 'Бедро (прав.)', color: '#f43f5e' },
  { key: 'neck',       label: 'Шея',           color: '#14b8a6' },
]

const periods = [
  { v: '1w', l: '1 нед' },
  { v: '1m', l: '1 мес' },
  { v: '3m', l: '3 мес' },
  { v: '6m', l: '6 мес' },
  { v: '1y', l: '1 год' },
  { v: 'all', l: 'Всё' },
]

const measurements = ref<MeasurementEntry[]>([])
const period = ref<'1w' | '1m' | '3m' | '6m' | '1y' | 'all'>('3m')
const selected = ref<string[]>(['waist'])

const formDate = ref(new Date().toISOString().slice(0, 10))
const formNote = ref('')
const formValues = ref<Partial<Record<string, string>>>({})

async function load() {
  const res = await api.get('/diet/measurements')
  measurements.value = res.data
}

async function add() {
  const values: Partial<Record<string, number>> = {}
  for (const f of measurementFields) {
    const v = formValues.value[f.key]
    if (v !== undefined && v !== '') values[f.key] = Number(v)
  }
  if (!Object.keys(values).length) return
  const res = await api.post('/diet/measurements', { date: formDate.value, values, note: formNote.value })
  measurements.value = res.data
  formValues.value = {}
  formNote.value = ''
}

async function remove(id: string) {
  const res = await api.delete(`/diet/measurements/${id}`)
  measurements.value = res.data
}

function toggle(key: string) {
  selected.value = selected.value.includes(key)
    ? selected.value.filter(k => k !== key)
    : [...selected.value, key]
}

const filtered = computed(() => {
  const days = ({ '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365, 'all': Infinity } as Record<string, number>)[period.value]
  if (days === Infinity) return measurements.value
  const from = new Date()
  from.setDate(from.getDate() - days)
  const fromStr = from.toISOString().slice(0, 10)
  return measurements.value.filter(e => e.date >= fromStr)
})

const chartData = computed(() => {
  const entries = filtered.value
  if (!entries.length || !selected.value.length) return null
  const labels = [...new Set(entries.map(e => e.date))].sort()
  const datasets = selected.value.map(key => {
    const field = measurementFields.find(f => f.key === key)!
    const byDate = new Map(
      entries.filter(e => e.values[key] != null).map(e => [e.date, e.values[key] as number])
    )
    return {
      label: `${field.label} (мм)`,
      data: labels.map(d => byDate.get(d) ?? null),
      borderColor: field.color,
      backgroundColor: field.color + '22',
      fill: false,
      tension: 0.3,
      pointRadius: 4,
      pointHoverRadius: 6,
      spanGaps: true,
    }
  }).filter(ds => ds.data.some(v => v != null))
  return datasets.length ? { labels, datasets } : null
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' as const },
    tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.parsed.y} мм` } },
  },
  scales: {
    y: { ticks: { callback: (v: any) => `${v} мм` } },
  },
}

// Latest values per field for summary row
const latest = computed(() => {
  const result: Partial<Record<string, number>> = {}
  for (const entry of measurements.value) {
    for (const [k, v] of Object.entries(entry.values)) {
      if (v != null) result[k] = v
    }
  }
  return result
})

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold">Замеры тела</h1>

    <!-- Latest summary -->
    <div v-if="Object.keys(latest).length" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card v-for="f in measurementFields.filter(f => latest[f.key] != null)" :key="f.key" class="p-3 text-center">
        <p class="text-xs text-muted-foreground mb-1">{{ f.label }}</p>
        <p class="text-2xl font-bold" :style="`color:${f.color}`">{{ latest[f.key] }}</p>
        <p class="text-xs text-muted-foreground">мм</p>
      </Card>
    </div>

    <!-- Chart -->
    <Card class="p-4 space-y-3">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <span class="text-sm font-medium text-muted-foreground">График</span>
        <div class="flex rounded-lg border overflow-hidden">
          <button v-for="p in periods" :key="p.v"
            :class="['px-2.5 py-1 text-xs font-medium transition-colors border-r last:border-r-0',
              period === p.v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground']"
            @click="period = p.v as any">{{ p.l }}</button>
        </div>
      </div>

      <!-- Field toggles -->
      <div class="flex flex-wrap gap-1.5">
        <button v-for="f in measurementFields" :key="f.key"
          :class="['px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
            selected.includes(f.key) ? 'text-white border-transparent' : 'bg-transparent border-border text-muted-foreground hover:border-muted-foreground']"
          :style="selected.includes(f.key) ? `background:${f.color}` : ''"
          @click="toggle(f.key)">
          {{ f.label }}
        </button>
      </div>

      <div v-if="chartData" class="h-64">
        <Line :data="chartData" :options="chartOptions" />
      </div>
      <p v-else class="text-sm text-muted-foreground text-center py-10">Нет данных за выбранный период</p>
    </Card>

    <!-- Add form -->
    <Card class="p-4 space-y-4">
      <p class="text-sm font-semibold">Добавить замер</p>
      <div class="space-y-1">
        <Label class="text-xs">Дата</Label>
        <Input v-model="formDate" type="date" class="h-9 w-40" />
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div v-for="f in measurementFields" :key="f.key" class="space-y-1">
          <Label class="text-xs" :style="`color:${f.color}`">{{ f.label }}</Label>
          <div class="relative">
            <Input v-model="formValues[f.key]" type="number" min="0" placeholder="—" class="h-9 pr-8" />
            <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">мм</span>
          </div>
        </div>
      </div>
      <div class="space-y-1">
        <Label class="text-xs">Заметка</Label>
        <Input v-model="formNote" placeholder="Необязательно" class="h-9" />
      </div>
      <Button @click="add" :disabled="Object.values(formValues).every(v => !v)">
        <Plus class="w-4 h-4 mr-2" />Сохранить замер
      </Button>
    </Card>

    <!-- History -->
    <div class="space-y-2">
      <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">История</h2>
      <div v-for="entry in [...measurements].reverse()" :key="entry.id"
        class="rounded-lg border bg-card p-3 group hover:bg-accent/20 transition-colors">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium">{{ entry.date }}</span>
          <div class="flex items-center gap-2">
            <span v-if="entry.note" class="text-xs text-muted-foreground truncate max-w-40">{{ entry.note }}</span>
            <button
              class="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              @click="remove(entry.id)">
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <span v-for="f in measurementFields.filter(f => entry.values[f.key] != null)" :key="f.key" class="text-xs">
            <span class="text-muted-foreground">{{ f.label }}:</span>
            <span class="font-semibold ml-1" :style="`color:${f.color}`">{{ entry.values[f.key] }} мм</span>
          </span>
        </div>
      </div>
      <p v-if="measurements.length === 0" class="text-sm text-muted-foreground text-center py-8">
        Нет замеров. Добавьте первый.
      </p>
    </div>
  </div>
</template>
