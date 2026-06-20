<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend, Filler
} from 'chart.js'
import api from '@/api'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Card from '@/components/ui/Card.vue'
import Label from '@/components/ui/Label.vue'
import { Search, Plus, Trash2, Settings, Apple, ChefHat, X, Pencil, Scale } from 'lucide-vue-next'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

interface Per100g { calories: number; protein: number; fat: number; carbs: number }
interface Product { id: string; name: string; per100g: Per100g; createdAt: string }
interface Ingredient { productId: string; productName: string; grams: number }
interface Dish { id: string; name: string; ingredients: Ingredient[]; per100g: Per100g; totalGrams: number; createdAt: string }
interface LogEntry { id: string; name: string; grams: number; meal: string; date: string; calories: number; protein: number; fat: number; carbs: number }
interface Goals { calories: number; protein: number; fat: number; carbs: number }

// ── State ────────────────────────────────────────────────────────────────────
const tab = ref<'log' | 'add' | 'products' | 'dishes' | 'weight' | 'measurements'>('log')
const selectedDate = ref(new Date().toISOString().slice(0, 10))

const log = ref<LogEntry[]>([])
const goals = ref<Goals>({ calories: 2000, protein: 150, fat: 65, carbs: 250 })
const products = ref<Product[]>([])
const dishes = ref<Dish[]>([])

// ── Add to log ────────────────────────────────────────────────────────────────
const addQuery = ref('')
const addMeal = ref('other')
const addGrams = ref(100)
const addTarget = ref<{ name: string; per100g: Per100g } | null>(null)

// ── Product form ──────────────────────────────────────────────────────────────
const showProductForm = ref(false)
const editingProductId = ref<string | null>(null)
const productForm = ref({ name: '', calories: 0, protein: 0, fat: 0, carbs: 0 })

// ── Dish builder ──────────────────────────────────────────────────────────────
const showDishBuilder = ref(false)
const editingDishId = ref<string | null>(null)
const dishName = ref('')
const dishIngredients = ref<(Ingredient & { _grams: number })[]>([])
const dishIngQuery = ref('')
const editingDishObj = ref<Dish | null>(null)

// ── Weight ────────────────────────────────────────────────────────────────────
interface WeightEntry { id: string; date: string; weight: number; note: string }
const weightLog = ref<WeightEntry[]>([])
const weightGoal = ref<number | null>(null)
const weightInput = ref('')
const weightDate = ref(new Date().toISOString().slice(0, 10))
const weightNote = ref('')
const editingWeightGoal = ref(false)
const weightGoalInput = ref<number | undefined>(undefined)

async function loadWeight() {
  const res = await api.get('/diet/weight')
  weightLog.value = res.data.log
  weightGoal.value = res.data.goal
}

async function addWeight() {
  if (!weightInput.value) return
  const res = await api.post('/diet/weight', {
    weight: Number(weightInput.value),
    date: weightDate.value,
    note: weightNote.value,
  })
  weightLog.value = res.data.log
  weightInput.value = ''
  weightNote.value = ''
}

async function deleteWeight(id: string) {
  const res = await api.delete(`/diet/weight/${id}`)
  weightLog.value = res.data.log
}

async function saveWeightGoal() {
  const res = await api.put('/diet/weight/goal', { goal: weightGoalInput.value })
  weightGoal.value = res.data.goal
  editingWeightGoal.value = false
}

// Build ideal trajectory: -1% per week from first entry's weight
// Spread across all dates in the log range (plus optionally up to goal)
const weightChartData = computed(() => {
  const sorted = filteredWeightLog.value
  if (sorted.length === 0) return null

  const labels = sorted.map(e => e.date)
  const actual = sorted.map(e => parseFloat(e.weight.toFixed(1)))

  // Ideal: starting from first weight, -1% per week for each date
  const startDate = new Date(sorted[0].date)
  const startWeight = sorted[0].weight
  const idealPoints = sorted.map(e => {
    const days = (new Date(e.date).getTime() - startDate.getTime()) / 86400000
    const weeks = days / 7
    return parseFloat((startWeight * Math.pow(0.99, weeks)).toFixed(1))
  })

  return {
    labels,
    datasets: [
      {
        label: 'Фактический вес',
        data: actual,
        borderColor: '#a78bfa',
        backgroundColor: 'rgba(167,139,250,0.1)',
        fill: false,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
      {
        label: 'Идеальный темп (-1%/нед.)',
        data: idealPoints,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.08)',
        borderDash: [6, 3],
        fill: false,
        tension: 0.3,
        pointRadius: 2,
      },
    ],
  }
})

const weightChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' as const },
    tooltip: { callbacks: { label: (ctx: any) => ` ${parseFloat(ctx.parsed.y.toFixed(1))} кг` } },
  },
  scales: {
    y: {
      ticks: { callback: (v: any) => `${parseFloat(Number(v).toFixed(1))} кг` },
    },
  },
}

const weightPeriod = ref<'1w' | '1m' | '3m' | '6m' | '1y' | 'all'>('3m')

const weightPeriods = [
  { v: '1w', l: '1 нед' },
  { v: '1m', l: '1 мес' },
  { v: '3m', l: '3 мес' },
  { v: '6m', l: '6 мес' },
  { v: '1y', l: '1 год' },
  { v: 'all', l: 'Всё' },
]

function periodDays(p: string) {
  return { '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365, 'all': Infinity }[p] ?? Infinity
}

const filteredWeightLog = computed(() => {
  const sorted = [...weightLog.value].sort((a, b) => a.date.localeCompare(b.date))
  const days = periodDays(weightPeriod.value)
  if (days === Infinity) return sorted
  const from = new Date()
  from.setDate(from.getDate() - days)
  const fromStr = from.toISOString().slice(0, 10)
  return sorted.filter(e => e.date >= fromStr)
})

const latestWeight = computed(() => weightLog.value.at(-1)?.weight ?? null)
const firstWeight = computed(() => weightLog.value[0]?.weight ?? null)
const totalLost = computed(() => firstWeight.value && latestWeight.value ? Math.round((firstWeight.value - latestWeight.value) * 10) / 10 : 0)

// ── Goals ──────────────────────────────────────────────────────────────────────
const showGoals = ref(false)
const goalsEdit = ref({ ...goals.value })

const meals = [
  { value: 'breakfast', label: 'Завтрак' },
  { value: 'lunch', label: 'Обед' },
  { value: 'dinner', label: 'Ужин' },
  { value: 'snack', label: 'Перекус' },
  { value: 'other', label: 'Другое' },
]
function mealLabel(m: string) { return meals.find(x => x.value === m)?.label || m }

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadAll() {
  const [logRes, goalsRes, productsRes, dishesRes] = await Promise.all([
    api.get('/diet/log', { params: { date: selectedDate.value } }),
    api.get('/diet/goals'),
    api.get('/diet/products'),
    api.get('/diet/dishes'),
  ])
  log.value = logRes.data
  goals.value = goalsRes.data
  goalsEdit.value = { ...goalsRes.data }
  products.value = productsRes.data
  dishes.value = dishesRes.data
}
watch(selectedDate, () => api.get('/diet/log', { params: { date: selectedDate.value } }).then(r => log.value = r.data))
onMounted(() => Promise.all([loadAll(), loadWeight(), loadMeasurements()]))

// ── Totals ────────────────────────────────────────────────────────────────────
const totals = computed(() => log.value.reduce((a, e) => ({
  calories: a.calories + e.calories, protein: a.protein + e.protein,
  fat: a.fat + e.fat, carbs: a.carbs + e.carbs
}), { calories: 0, protein: 0, fat: 0, carbs: 0 }))

function pct(val: number, goal: number) { return Math.min(100, goal ? Math.round(val / goal * 100) : 0) }

const logByMeal = computed(() => {
  const g: Record<string, LogEntry[]> = {}
  for (const e of log.value) { if (!g[e.meal]) g[e.meal] = []; g[e.meal].push(e) }
  return g
})

// ── Add to log ────────────────────────────────────────────────────────────────
const filteredAdd = computed(() => {
  const q = addQuery.value.toLowerCase()
  const prods = products.value.filter(p => p.name.toLowerCase().includes(q)).map(p => ({ type: 'product' as const, item: p }))
  const dishs = dishes.value.filter(d => d.name.toLowerCase().includes(q)).map(d => ({ type: 'dish' as const, item: d }))
  return [...prods, ...dishs]
})

async function addToLog() {
  if (!addTarget.value) return
  await api.post('/diet/log', {
    name: addTarget.value.name,
    grams: addGrams.value,
    per100g: addTarget.value.per100g,
    meal: addMeal.value,
    date: selectedDate.value
  })
  await api.get('/diet/log', { params: { date: selectedDate.value } }).then(r => log.value = r.data)
  addTarget.value = null
  addGrams.value = 100
  addQuery.value = ''
  tab.value = 'log'
}

async function deleteEntry(id: string) {
  await api.delete(`/diet/log/${id}`)
  log.value = log.value.filter(e => e.id !== id)
}

// ── Products ──────────────────────────────────────────────────────────────────
function openNewProduct() {
  editingProductId.value = null
  productForm.value = { name: '', calories: 0, protein: 0, fat: 0, carbs: 0 }
  showProductForm.value = true
}

function openEditProduct(p: Product) {
  editingProductId.value = p.id
  productForm.value = { name: p.name, calories: p.per100g.calories, protein: p.per100g.protein, fat: p.per100g.fat, carbs: p.per100g.carbs }
  showProductForm.value = true
}

async function saveProduct() {
  const payload = { name: productForm.value.name, per100g: { calories: productForm.value.calories, protein: productForm.value.protein, fat: productForm.value.fat, carbs: productForm.value.carbs } }
  if (editingProductId.value) {
    await api.put(`/diet/products/${editingProductId.value}`, payload)
  } else {
    await api.post('/diet/products', payload)
  }
  const r = await api.get('/diet/products')
  products.value = r.data
  showProductForm.value = false
}

async function deleteProduct(id: string) {
  await api.delete(`/diet/products/${id}`)
  products.value = products.value.filter(p => p.id !== id)
}

// ── Dishes ────────────────────────────────────────────────────────────────────
function openNewDish() {
  editingDishId.value = null
  dishName.value = ''
  dishIngredients.value = []
  dishIngQuery.value = ''
  showDishBuilder.value = true
}

function openEditDish(d: Dish) {
  editingDishId.value = d.id
  dishName.value = d.name
  dishIngredients.value = d.ingredients.map(i => ({ ...i, _grams: i.grams }))
  dishIngQuery.value = ''
  showDishBuilder.value = true
}

const filteredDishProducts = computed(() => {
  const q = dishIngQuery.value.toLowerCase()
  return q ? products.value.filter(p => p.name.toLowerCase().includes(q)) : []
})

function addIngredient(p: Product) {
  if (dishIngredients.value.find(i => i.productId === p.id)) return
  dishIngredients.value.push({ productId: p.id, productName: p.name, grams: 100, _grams: 100 })
  dishIngQuery.value = ''
}

function removeIngredient(productId: string) {
  dishIngredients.value = dishIngredients.value.filter(i => i.productId !== productId)
}

const dishCalc = computed(() => {
  let cal = 0, prot = 0, fat = 0, carbs = 0, total = 0
  for (const ing of dishIngredients.value) {
    const prod = products.value.find(p => p.id === ing.productId)
    if (!prod) continue
    const f = ing._grams / 100
    cal += prod.per100g.calories * f
    prot += prod.per100g.protein * f
    fat += prod.per100g.fat * f
    carbs += prod.per100g.carbs * f
    total += ing._grams
  }
  const per = total > 0 ? 100 / total : 0
  return {
    totalGrams: total,
    totalCal: Math.round(cal),
    per100g: {
      calories: Math.round(cal * per),
      protein: Math.round(prot * per * 10) / 10,
      fat: Math.round(fat * per * 10) / 10,
      carbs: Math.round(carbs * per * 10) / 10,
    }
  }
})

async function saveDish() {
  if (!dishName.value.trim() || dishIngredients.value.length === 0) return
  const payload = {
    name: dishName.value.trim(),
    ingredients: dishIngredients.value.map(i => ({ productId: i.productId, productName: i.productName, grams: i._grams })),
    per100g: dishCalc.value.per100g,
    totalGrams: dishCalc.value.totalGrams,
  }
  if (editingDishId.value) {
    await api.put(`/diet/dishes/${editingDishId.value}`, payload)
  } else {
    await api.post('/diet/dishes', payload)
  }
  const r = await api.get('/diet/dishes')
  dishes.value = r.data
  showDishBuilder.value = false
}

async function deleteDish(id: string) {
  await api.delete(`/diet/dishes/${id}`)
  dishes.value = dishes.value.filter(d => d.id !== id)
}

// ── Measurements ──────────────────────────────────────────────────────────────
interface MeasurementEntry { id: string; date: string; note: string; values: Partial<Record<string, number>> }

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

const measurements = ref<MeasurementEntry[]>([])
const mPeriod = ref<'1w' | '1m' | '3m' | '6m' | '1y' | 'all'>('3m')
const mSelected = ref<string[]>(['waist'])
const mFormDate = ref(new Date().toISOString().slice(0, 10))
const mFormNote = ref('')
const mFormValues = ref<Partial<Record<string, string>>>({})

async function loadMeasurements() {
  const res = await api.get('/diet/measurements')
  measurements.value = res.data
}

async function addMeasurement() {
  const values: Partial<Record<string, number>> = {}
  for (const f of measurementFields) {
    const v = mFormValues.value[f.key]
    if (v !== undefined && v !== '') values[f.key] = Number(v)
  }
  if (!Object.keys(values).length) return
  const res = await api.post('/diet/measurements', { date: mFormDate.value, values, note: mFormNote.value })
  measurements.value = res.data
  mFormValues.value = {}
  mFormNote.value = ''
}

async function deleteMeasurement(id: string) {
  const res = await api.delete(`/diet/measurements/${id}`)
  measurements.value = res.data
}

function toggleMField(key: string) {
  mSelected.value = mSelected.value.includes(key)
    ? mSelected.value.filter(k => k !== key)
    : [...mSelected.value, key]
}

const filteredMeasurements = computed(() => {
  const days = ({ '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365, 'all': Infinity } as Record<string, number>)[mPeriod.value]
  if (days === Infinity) return measurements.value
  const from = new Date(); from.setDate(from.getDate() - days)
  return measurements.value.filter(e => e.date >= from.toISOString().slice(0, 10))
})

const measurementChartData = computed(() => {
  const entries = filteredMeasurements.value
  if (!entries.length || !mSelected.value.length) return null
  const labels = [...new Set(entries.map(e => e.date))].sort()
  const datasets = mSelected.value.map(key => {
    const field = measurementFields.find(f => f.key === key)!
    const byDate = new Map(entries.filter(e => e.values[key] != null).map(e => [e.date, e.values[key] as number]))
    return {
      label: `${field.label} (мм)`,
      data: labels.map(d => byDate.get(d) ?? null),
      borderColor: field.color,
      backgroundColor: field.color + '22',
      fill: false, tension: 0.3, pointRadius: 4, pointHoverRadius: 6, spanGaps: true,
    }
  }).filter(ds => ds.data.some(v => v != null))
  return datasets.length ? { labels, datasets } : null
})

const measurementChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom' as const } },
  scales: { y: { ticks: { callback: (v: any) => `${v} мм` } } },
}

// ── Goals ──────────────────────────────────────────────────────────────────────
async function saveGoals() {
  const r = await api.put('/diet/goals', goalsEdit.value)
  goals.value = r.data
  showGoals.value = false
}

</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Питание</h1>
      <div class="flex gap-2">
        <Button variant="outline" size="icon" @click="showGoals = true" title="Цели"><Settings class="w-4 h-4" /></Button>
        <input type="date" v-model="selectedDate"
          class="h-10 rounded-md border border-input bg-background px-3 text-sm" />
      </div>
    </div>

    <!-- Progress -->
    <Card class="p-4 space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">Калории</span>
        <span class="text-sm text-muted-foreground">{{ totals.calories }} / {{ goals.calories }} ккал</span>
      </div>
      <div class="h-2 rounded-full bg-muted overflow-hidden">
        <div class="h-full rounded-full bg-orange-500 transition-all" :style="`width:${pct(totals.calories, goals.calories)}%`" />
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div v-for="[key, label, color] in [['protein','Белки','bg-blue-500'],['fat','Жиры','bg-yellow-500'],['carbs','Углеводы','bg-green-500']]" :key="key">
          <div class="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{{ label }}</span><span>{{ (totals as any)[key] }}г / {{ (goals as any)[key] }}г</span>
          </div>
          <div class="h-1.5 rounded-full bg-muted overflow-hidden">
            <div :class="['h-full rounded-full transition-all', color]" :style="`width:${pct((totals as any)[key], (goals as any)[key])}%`" />
          </div>
        </div>
      </div>
    </Card>

    <!-- Tabs -->
    <div class="flex gap-0 border-b overflow-x-auto">
      <button v-for="[v, l] in [['log','Дневник'],['add','Добавить'],['products','Продукты'],['dishes','Блюда'],['weight','Вес'],['measurements','Замеры']]" :key="v"
        class="whitespace-nowrap flex-shrink-0"
        :class="['px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap', tab === v ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground']"
        @click="tab = v as any">{{ l }}</button>
    </div>

    <!-- ── LOG ── -->
    <div v-if="tab === 'log'" class="space-y-4">
      <div v-for="(entries, mealKey) in logByMeal" :key="mealKey">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{{ mealLabel(mealKey) }}</h3>
        <div class="space-y-1.5">
          <Card v-for="entry in entries" :key="entry.id" class="p-3 flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{{ entry.name }}</p>
              <p class="text-xs text-muted-foreground">{{ entry.grams }}г · {{ entry.calories }} ккал</p>
            </div>
            <div class="text-xs text-muted-foreground hidden sm:flex gap-3 flex-shrink-0">
              <span>Б {{ entry.protein }}г</span>
              <span>Ж {{ entry.fat }}г</span>
              <span>У {{ entry.carbs }}г</span>
            </div>
            <button class="text-muted-foreground hover:text-destructive p-1" @click="deleteEntry(entry.id)">
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </Card>
        </div>
      </div>
      <p v-if="log.length === 0" class="text-sm text-muted-foreground text-center py-10">
        Нет записей. Перейдите в «Добавить».
      </p>
    </div>

    <!-- ── ADD ── -->
    <div v-if="tab === 'add'" class="space-y-4">
      <div v-if="!addTarget">
        <div class="relative mb-3">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input v-model="addQuery" placeholder="Поиск продукта или блюда..." class="pl-9" />
        </div>
        <div class="space-y-1.5">
          <template v-if="addQuery">
            <div v-if="filteredAdd.length === 0" class="text-sm text-muted-foreground text-center py-6">Ничего не найдено</div>
            <Card v-for="row in filteredAdd" :key="row.item.id"
              class="p-3 flex items-center gap-3 cursor-pointer hover:bg-accent transition-colors"
              @click="addTarget = { name: row.item.name, per100g: row.item.per100g }">
              <component :is="row.type === 'dish' ? ChefHat : Apple" class="w-7 h-7 text-muted-foreground flex-shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{{ row.item.name }}</p>
                <p class="text-xs text-muted-foreground">
                  {{ row.type === 'dish' ? 'блюдо' : 'продукт' }} · {{ row.item.per100g.calories }} ккал/100г
                </p>
              </div>
            </Card>
          </template>
          <p v-else class="text-sm text-muted-foreground text-center py-6">Начните вводить название</p>
        </div>
      </div>

      <!-- Selected item form -->
      <Card v-else class="p-4 space-y-4">
        <div class="flex items-start justify-between">
          <div>
            <p class="font-semibold">{{ addTarget.name }}</p>
            <p class="text-xs text-muted-foreground mt-0.5">{{ addTarget.per100g.calories }} ккал / 100г</p>
          </div>
          <button @click="addTarget = null" class="text-muted-foreground hover:text-foreground"><X class="w-4 h-4" /></button>
        </div>

        <!-- Live preview -->
        <div class="grid grid-cols-4 gap-2 text-center text-sm">
          <div class="p-2 rounded-md bg-orange-500/10">
            <p class="font-bold text-orange-500">{{ Math.round(addTarget.per100g.calories * addGrams / 100) }}</p>
            <p class="text-xs text-muted-foreground">ккал</p>
          </div>
          <div class="p-2 rounded-md bg-blue-500/10">
            <p class="font-bold text-blue-500">{{ (addTarget.per100g.protein * addGrams / 100).toFixed(1) }}</p>
            <p class="text-xs text-muted-foreground">белки</p>
          </div>
          <div class="p-2 rounded-md bg-yellow-500/10">
            <p class="font-bold text-yellow-500">{{ (addTarget.per100g.fat * addGrams / 100).toFixed(1) }}</p>
            <p class="text-xs text-muted-foreground">жиры</p>
          </div>
          <div class="p-2 rounded-md bg-green-500/10">
            <p class="font-bold text-green-500">{{ (addTarget.per100g.carbs * addGrams / 100).toFixed(1) }}</p>
            <p class="text-xs text-muted-foreground">углев</p>
          </div>
        </div>

        <div class="space-y-2">
          <Label>Граммовка</Label>
          <!-- Быстрые пресеты -->
          <div class="flex flex-wrap gap-1.5">
            <button v-for="g in [25, 50, 75, 100, 125, 150, 200, 250]" :key="g"
              :class="['px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                addGrams === g
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-transparent hover:border-border']"
              @click="addGrams = g">
              {{ g }}г
            </button>
          </div>
          <!-- Точный счётчик -->
          <div class="flex items-center gap-2">
            <button class="w-9 h-9 rounded-md border flex items-center justify-center text-lg hover:bg-accent transition-colors"
              @click="addGrams = Math.max(25, addGrams - 25)">−</button>
            <Input v-model.number="addGrams" type="number" min="25" step="25" class="flex-1 text-center" />
            <button class="w-9 h-9 rounded-md border flex items-center justify-center text-lg hover:bg-accent transition-colors"
              @click="addGrams = addGrams + 25">+</button>
          </div>
        </div>
        <div class="flex gap-3">
          <div class="flex-1 space-y-1">
            <Label>Приём пищи</Label>
            <select v-model="addMeal" class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option v-for="m in meals" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </div>
        </div>
        <Button class="w-full" @click="addToLog"><Plus class="w-4 h-4 mr-2" />Добавить в дневник</Button>
      </Card>
    </div>

    <!-- ── PRODUCTS ── -->
    <div v-if="tab === 'products'" class="space-y-3">
      <div class="flex justify-end">
        <Button @click="openNewProduct"><Plus class="w-4 h-4 mr-2" />Новый продукт</Button>
      </div>
      <p v-if="products.length === 0" class="text-sm text-muted-foreground text-center py-10">Нет продуктов. Добавьте первый.</p>
      <Card v-for="p in products" :key="p.id" class="p-3 flex items-center gap-3">
        <Apple class="w-6 h-6 text-muted-foreground flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">{{ p.name }}</p>
          <p class="text-xs text-muted-foreground">
            {{ p.per100g.calories }} ккал · Б{{ p.per100g.protein }} · Ж{{ p.per100g.fat }} · У{{ p.per100g.carbs }} (на 100г)
          </p>
        </div>
        <button class="p-1 text-muted-foreground hover:text-foreground" @click="openEditProduct(p)"><Pencil class="w-3.5 h-3.5" /></button>
        <button class="p-1 text-muted-foreground hover:text-destructive" @click="deleteProduct(p.id)"><Trash2 class="w-3.5 h-3.5" /></button>
      </Card>
    </div>

    <!-- ── DISHES ── -->
    <div v-if="tab === 'dishes'" class="space-y-3">
      <div class="flex justify-end">
        <Button @click="openNewDish"><Plus class="w-4 h-4 mr-2" />Новое блюдо</Button>
      </div>
      <p v-if="dishes.length === 0" class="text-sm text-muted-foreground text-center py-10">Нет блюд. Создайте из продуктов.</p>
      <Card v-for="d in dishes" :key="d.id" class="p-3 space-y-2">
        <div class="flex items-center gap-3">
          <ChefHat class="w-6 h-6 text-muted-foreground flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ d.name }}</p>
            <p class="text-xs text-muted-foreground">{{ d.totalGrams }}г итого</p>
          </div>
          <button class="p-1 text-muted-foreground hover:text-foreground" @click="openEditDish(d)"><Pencil class="w-3.5 h-3.5" /></button>
          <button class="p-1 text-muted-foreground hover:text-destructive" @click="deleteDish(d.id)"><Trash2 class="w-3.5 h-3.5" /></button>
        </div>
        <!-- КБЖУ -->
        <div class="grid grid-cols-2 gap-1.5 text-xs">
          <div class="rounded-md bg-muted/60 px-2.5 py-1.5 space-y-0.5">
            <p class="text-muted-foreground font-medium">На блюдо ({{ d.totalGrams }}г)</p>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5">
              <span class="text-orange-500 font-semibold">{{ Math.round(d.per100g.calories * d.totalGrams / 100) }} ккал</span>
              <span>Б <b>{{ (d.per100g.protein * d.totalGrams / 100).toFixed(1) }}</b>г</span>
              <span>Ж <b>{{ (d.per100g.fat * d.totalGrams / 100).toFixed(1) }}</b>г</span>
              <span>У <b>{{ (d.per100g.carbs * d.totalGrams / 100).toFixed(1) }}</b>г</span>
            </div>
          </div>
          <div class="rounded-md bg-muted/60 px-2.5 py-1.5 space-y-0.5">
            <p class="text-muted-foreground font-medium">На 100г</p>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5">
              <span class="text-orange-500 font-semibold">{{ d.per100g.calories }} ккал</span>
              <span>Б <b>{{ d.per100g.protein }}</b>г</span>
              <span>Ж <b>{{ d.per100g.fat }}</b>г</span>
              <span>У <b>{{ d.per100g.carbs }}</b>г</span>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-1">
          <span v-for="ing in d.ingredients" :key="ing.productId"
            class="text-xs bg-muted px-2 py-0.5 rounded-full">
            {{ ing.productName }} {{ ing.grams }}г
          </span>
        </div>
      </Card>
    </div>
    <!-- ── WEIGHT ── -->
    <div v-if="tab === 'weight'" class="space-y-4">

      <!-- Stats row -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card class="p-3 text-center">
          <p class="text-xs text-muted-foreground mb-1">Старт</p>
          <p class="text-2xl font-bold">{{ firstWeight ?? '—' }}</p>
          <p class="text-xs text-muted-foreground">кг</p>
        </Card>
        <Card class="p-3 text-center">
          <p class="text-xs text-muted-foreground mb-1">Сейчас</p>
          <p class="text-2xl font-bold text-primary">{{ latestWeight ?? '—' }}</p>
          <p class="text-xs text-muted-foreground">кг</p>
        </Card>
        <Card class="p-3 text-center">
          <p class="text-xs text-muted-foreground mb-1">Потеряно</p>
          <p class="text-2xl font-bold" :class="totalLost > 0 ? 'text-green-500' : totalLost < 0 ? 'text-orange-500' : 'text-muted-foreground'">
            {{ totalLost > 0 ? '−' : totalLost < 0 ? '+' : '' }}{{ Math.abs(totalLost) || '—' }}
          </p>
          <p class="text-xs text-muted-foreground">кг</p>
        </Card>
        <Card class="p-3 text-center cursor-pointer hover:bg-accent/30"
          @click="editingWeightGoal = true; weightGoalInput = weightGoal ?? undefined">
          <p class="text-xs text-muted-foreground mb-1">Цель</p>
          <div v-if="!editingWeightGoal">
            <p class="text-2xl font-bold text-green-500">{{ weightGoal ?? '—' }}</p>
            <p class="text-xs text-muted-foreground">{{ weightGoal ? 'кг · изменить' : 'нажмите' }}</p>
          </div>
          <div v-else class="flex flex-col gap-1">
            <Input v-model.number="weightGoalInput" type="number" step="0.1" class="h-8 text-center text-sm"
              @keyup.enter="saveWeightGoal" @keyup.escape="editingWeightGoal = false" />
            <Button size="sm" class="h-6 text-xs" @click="saveWeightGoal">OK</Button>
          </div>
        </Card>
      </div>

      <!-- Chart -->
      <Card class="p-4 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-muted-foreground">График веса</span>
          <div class="flex rounded-lg border overflow-hidden">
            <button v-for="p in weightPeriods" :key="p.v"
              :class="['px-2.5 py-1 text-xs font-medium transition-colors border-r last:border-r-0',
                weightPeriod === p.v
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent text-muted-foreground']"
              @click="weightPeriod = p.v as any">
              {{ p.l }}
            </button>
          </div>
        </div>
        <div v-if="weightChartData" class="h-64">
          <Line :data="weightChartData" :options="weightChartOptions" />
        </div>
        <p v-else class="text-sm text-muted-foreground text-center py-16">
          Нет данных за выбранный период
        </p>
      </Card>

      <!-- Add entry -->
      <Card class="p-4 space-y-3">
        <p class="text-sm font-medium">Добавить замер</p>
        <div class="flex gap-2 flex-wrap">
          <div class="space-y-1 flex-shrink-0">
            <Label class="text-xs">Дата</Label>
            <Input v-model="weightDate" type="date" class="h-9 w-36" />
          </div>
          <div class="space-y-1 w-28">
            <Label class="text-xs">Вес (кг)</Label>
            <Input v-model="weightInput" type="number" step="0.1" placeholder="70.5" class="h-9"
              @keyup.enter="addWeight" />
          </div>
          <div class="space-y-1 flex-1 min-w-32">
            <Label class="text-xs">Заметка</Label>
            <Input v-model="weightNote" placeholder="Необязательно" class="h-9" />
          </div>
          <div class="flex items-end">
            <Button class="h-9" @click="addWeight" :disabled="!weightInput">
              <Plus class="w-4 h-4 mr-1" />Сохранить
            </Button>
          </div>
        </div>
      </Card>

      <!-- Log table -->
      <div class="space-y-1">
        <div v-for="entry in [...weightLog].reverse()" :key="entry.id"
          class="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-accent/30 transition-colors group">
          <Scale class="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span class="text-sm text-muted-foreground w-24 flex-shrink-0">{{ entry.date }}</span>
          <span class="text-sm font-semibold w-16">{{ parseFloat(entry.weight.toFixed(1)) }} кг</span>
          <span class="text-sm text-muted-foreground flex-1 truncate">{{ entry.note }}</span>
          <button class="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            @click="deleteWeight(entry.id)">
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
        <p v-if="weightLog.length === 0" class="text-sm text-muted-foreground text-center py-6">Нет замеров</p>
      </div>
    </div>

    <!-- ── MEASUREMENTS ── -->
    <div v-if="tab === 'measurements'" class="space-y-4">

      <!-- Chart card -->
      <Card class="p-4 space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <span class="text-sm font-medium text-muted-foreground">График</span>
          <div class="flex rounded-lg border overflow-hidden">
            <button v-for="p in weightPeriods" :key="p.v"
              :class="['px-2.5 py-1 text-xs font-medium transition-colors border-r last:border-r-0',
                mPeriod === p.v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground']"
              @click="mPeriod = p.v as any">{{ p.l }}</button>
          </div>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="f in measurementFields" :key="f.key"
            :class="['px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              mSelected.includes(f.key) ? 'text-white border-transparent' : 'bg-transparent border-border text-muted-foreground hover:border-muted-foreground']"
            :style="mSelected.includes(f.key) ? `background:${f.color}` : ''"
            @click="toggleMField(f.key)">
            {{ f.label }}
          </button>
        </div>
        <div v-if="measurementChartData" class="h-64">
          <Line :data="measurementChartData" :options="measurementChartOptions" />
        </div>
        <p v-else class="text-sm text-muted-foreground text-center py-10">Нет данных за выбранный период</p>
      </Card>

      <!-- Add form -->
      <Card class="p-4 space-y-3">
        <p class="text-sm font-semibold">Добавить замер</p>
        <div class="space-y-1">
          <Label class="text-xs">Дата</Label>
          <Input v-model="mFormDate" type="date" class="h-9 w-40" />
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div v-for="f in measurementFields" :key="f.key" class="space-y-1">
            <Label class="text-xs" :style="`color:${f.color}`">{{ f.label }}</Label>
            <div class="relative">
              <Input v-model="mFormValues[f.key]" type="number" min="0" placeholder="—" class="h-9 pr-8" />
              <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">мм</span>
            </div>
          </div>
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Заметка</Label>
          <Input v-model="mFormNote" placeholder="Необязательно" class="h-9" />
        </div>
        <Button @click="addMeasurement" :disabled="Object.values(mFormValues).every(v => !v)">
          <Plus class="w-4 h-4 mr-2" />Сохранить замер
        </Button>
      </Card>

      <!-- History -->
      <div class="space-y-2">
        <div v-for="entry in [...measurements].reverse()" :key="entry.id"
          class="rounded-lg border bg-card p-3 group hover:bg-accent/20 transition-colors">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium">{{ entry.date }}</span>
            <div class="flex items-center gap-2">
              <span v-if="entry.note" class="text-xs text-muted-foreground truncate max-w-40">{{ entry.note }}</span>
              <button class="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                @click="deleteMeasurement(entry.id)">
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

  </div>

  <!-- ── Product form modal ── -->
  <div v-if="showProductForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <Card class="w-full max-w-sm p-6 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-lg">{{ editingProductId ? 'Редактировать' : 'Новый продукт' }}</h2>
        <button @click="showProductForm = false"><X class="w-4 h-4 text-muted-foreground" /></button>
      </div>
      <div class="space-y-3">
        <div class="space-y-1"><Label>Название</Label><Input v-model="productForm.name" placeholder="Куриная грудка" /></div>
        <p class="text-xs text-muted-foreground font-medium uppercase tracking-wider">На 100г</p>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1"><Label>Калории (ккал)</Label><Input v-model.number="productForm.calories" type="number" min="0" /></div>
          <div class="space-y-1"><Label>Белки (г)</Label><Input v-model.number="productForm.protein" type="number" min="0" step="0.1" /></div>
          <div class="space-y-1"><Label>Жиры (г)</Label><Input v-model.number="productForm.fat" type="number" min="0" step="0.1" /></div>
          <div class="space-y-1"><Label>Углеводы (г)</Label><Input v-model.number="productForm.carbs" type="number" min="0" step="0.1" /></div>
        </div>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" class="flex-1" @click="showProductForm = false">Отмена</Button>
        <Button class="flex-1" @click="saveProduct" :disabled="!productForm.name.trim()">Сохранить</Button>
      </div>
    </Card>
  </div>

  <!-- ── Dish builder modal ── -->
  <div v-if="showDishBuilder" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <Card class="w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-auto">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-lg">{{ editingDishId ? 'Редактировать блюдо' : 'Новое блюдо' }}</h2>
        <button @click="showDishBuilder = false"><X class="w-4 h-4 text-muted-foreground" /></button>
      </div>

      <div class="space-y-1"><Label>Название блюда</Label><Input v-model="dishName" placeholder="Борщ, Овсянка..." /></div>

      <!-- Ingredient search -->
      <div class="space-y-1">
        <Label>Добавить ингредиент</Label>
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input v-model="dishIngQuery" placeholder="Поиск из ваших продуктов..." class="pl-9" />
        </div>
        <div v-if="filteredDishProducts.length" class="border rounded-md divide-y max-h-36 overflow-auto">
          <button v-for="p in filteredDishProducts" :key="p.id"
            class="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between"
            @click="addIngredient(p)">
            <span>{{ p.name }}</span>
            <span class="text-muted-foreground text-xs">{{ p.per100g.calories }} ккал/100г</span>
          </button>
        </div>
      </div>

      <!-- Ingredient list -->
      <div v-if="dishIngredients.length" class="space-y-2">
        <Label>Состав</Label>
        <div v-for="ing in dishIngredients" :key="ing.productId" class="flex items-center gap-2">
          <span class="flex-1 text-sm truncate">{{ ing.productName }}</span>
          <Input v-model.number="ing._grams" type="number" min="1" class="w-24 h-8" />
          <span class="text-xs text-muted-foreground">г</span>
          <button class="text-muted-foreground hover:text-destructive" @click="removeIngredient(ing.productId)">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Totals preview -->
      <div v-if="dishIngredients.length" class="rounded-md bg-muted p-3 grid grid-cols-4 gap-2 text-center text-sm">
        <div><p class="font-bold text-orange-500">{{ dishCalc.totalCal }}</p><p class="text-xs text-muted-foreground">ккал итого</p></div>
        <div><p class="font-bold">{{ dishCalc.per100g.calories }}</p><p class="text-xs text-muted-foreground">ккал/100г</p></div>
        <div><p class="font-bold">{{ dishCalc.totalGrams }}</p><p class="text-xs text-muted-foreground">г итого</p></div>
        <div>
          <p class="text-xs text-muted-foreground">Б{{ dishCalc.per100g.protein }}</p>
          <p class="text-xs text-muted-foreground">Ж{{ dishCalc.per100g.fat }}</p>
          <p class="text-xs text-muted-foreground">У{{ dishCalc.per100g.carbs }}</p>
        </div>
      </div>
      <p v-else class="text-sm text-muted-foreground text-center py-2">Добавьте ингредиенты из ваших продуктов</p>

      <div class="flex gap-2">
        <Button variant="outline" class="flex-1" @click="showDishBuilder = false">Отмена</Button>
        <Button class="flex-1" @click="saveDish" :disabled="!dishName.trim() || dishIngredients.length === 0">Сохранить</Button>
      </div>
    </Card>
  </div>

  <!-- Goals modal -->
  <div v-if="showGoals" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <Card class="w-full max-w-sm p-6 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-lg">Цели питания</h2>
        <button @click="showGoals = false"><X class="w-4 h-4 text-muted-foreground" /></button>
      </div>
      <div class="space-y-3">
        <div class="space-y-1"><Label>Калории (ккал)</Label><Input v-model.number="goalsEdit.calories" type="number" /></div>
        <div class="space-y-1"><Label>Белки (г)</Label><Input v-model.number="goalsEdit.protein" type="number" /></div>
        <div class="space-y-1"><Label>Жиры (г)</Label><Input v-model.number="goalsEdit.fat" type="number" /></div>
        <div class="space-y-1"><Label>Углеводы (г)</Label><Input v-model.number="goalsEdit.carbs" type="number" /></div>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" class="flex-1" @click="showGoals = false">Отмена</Button>
        <Button class="flex-1" @click="saveGoals">Сохранить</Button>
      </div>
    </Card>
  </div>
</template>
