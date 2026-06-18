<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Bar, Pie } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js'
import api from '@/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Card from '@/components/ui/Card.vue'
import Badge from '@/components/ui/Badge.vue'
import Label from '@/components/ui/Label.vue'
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet, Search, HandCoins, ChevronDown, ChevronUp, PiggyBank, X, Pencil } from 'lucide-vue-next'

ChartJS.register(ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

interface Category { id: string; name: string; color: string; icon: string }
interface Transaction { id: string; type: 'income' | 'expense'; amount: number; description: string; categoryId: string | null; date: string }
interface Stats { totalIncome: number; totalExpense: number; balance: number; byCategory: any[]; monthly: any[] }
interface DebtPayment { id: string; amount: number; note: string; date: string }
interface Debt { id: string; name: string; totalAmount: number; monthlyPayment: number | null; direction: 'owe' | 'owed'; note: string; dueDate: string | null; payments: DebtPayment[]; createdAt: string }
interface CushionEntry { id: string; amount: number; note: string; date: string }
interface Cushion { goal: number; contributions: CushionEntry[] }

const categories = ref<Category[]>([])
const transactions = ref<Transaction[]>([])
const stats = ref<Stats | null>(null)
const debts = ref<Debt[]>([])
const cushion = ref<Cushion>({ goal: 0, contributions: [] })
const tab = ref<'dashboard' | 'history' | 'categories' | 'debts'>('dashboard')

// Cushion state
const showCushionModal = ref(false)
const cushionAddAmount = ref('')
const cushionAddNote = ref('')
const cushionAddDate = ref(new Date().toISOString().slice(0, 10))
const editingCushionGoal = ref(false)
const cushionGoalInput = ref(0)

const cushionTotal = computed(() => cushion.value.contributions.reduce((s, c) => s + c.amount, 0))
const cushionPct = computed(() => cushion.value.goal > 0 ? Math.min(100, Math.round(cushionTotal.value / cushion.value.goal * 100)) : 0)

// Debt state
const showAddDebt = ref(false)
const newDebt = ref({ name: '', totalAmount: '', monthlyPayment: '', direction: 'owe' as 'owe' | 'owed', note: '', dueDate: '' })
const expandedDebtId = ref<string | null>(null)
const showAddPayment = ref<string | null>(null)
const newPayment = ref({ amount: '', note: '', date: new Date().toISOString().slice(0, 10) })

function paidAmount(debt: Debt) {
  return debt.payments.reduce((s, p) => s + p.amount, 0)
}
function remainingAmount(debt: Debt) {
  return Math.max(0, debt.totalAmount - paidAmount(debt))
}
function debtProgress(debt: Debt) {
  return Math.min(100, Math.round(paidAmount(debt) / debt.totalAmount * 100))
}

async function loadDebts() {
  const res = await api.get('/finance/debts')
  debts.value = res.data
}

function monthsLeft(debt: Debt) {
  const remaining = remainingAmount(debt)
  if (!debt.monthlyPayment || debt.monthlyPayment <= 0 || remaining <= 0) return null
  return Math.ceil(remaining / debt.monthlyPayment)
}

async function addDebt() {
  await api.post('/finance/debts', {
    ...newDebt.value,
    totalAmount: Number(newDebt.value.totalAmount),
    monthlyPayment: newDebt.value.monthlyPayment ? Number(newDebt.value.monthlyPayment) : null
  })
  showAddDebt.value = false
  newDebt.value = { name: '', totalAmount: '', monthlyPayment: '', direction: 'owe', note: '', dueDate: '' }
  await loadDebts()
}

async function deleteDebt(id: string) {
  await api.delete(`/finance/debts/${id}`)
  await loadDebts()
}

async function addPayment(debtId: string) {
  await api.post(`/finance/debts/${debtId}/payments`, { ...newPayment.value, amount: Number(newPayment.value.amount) })
  showAddPayment.value = null
  newPayment.value = { amount: '', note: '', date: new Date().toISOString().slice(0, 10) }
  await loadDebts()
}

async function deletePayment(debtId: string, paymentId: string) {
  await api.delete(`/finance/debts/${debtId}/payments/${paymentId}`)
  await loadDebts()
}

const debtSummary = computed(() => {
  const iOwe = debts.value.filter(d => d.direction === 'owe')
  const owedToMe = debts.value.filter(d => d.direction === 'owed')
  return {
    iOweTotal: iOwe.reduce((s, d) => s + d.totalAmount, 0),
    iOwePaid: iOwe.reduce((s, d) => s + paidAmount(d), 0),
    iOweRemaining: iOwe.reduce((s, d) => s + remainingAmount(d), 0),
    owedTotal: owedToMe.reduce((s, d) => s + d.totalAmount, 0),
    owedPaid: owedToMe.reduce((s, d) => s + paidAmount(d), 0),
    owedRemaining: owedToMe.reduce((s, d) => s + remainingAmount(d), 0),
  }
})

const filterType = ref('')
const filterCategory = ref('')
const filterYear = ref('')
const filterMonth = ref('')
const searchTx = ref('')

const newTx = ref({ type: 'expense' as 'income' | 'expense', amount: '', description: '', categoryId: '', date: new Date().toISOString().slice(0, 10) })
const newCat = ref({ name: '', color: '#6366f1', icon: '📁' })
const showAddTx = ref(false)
const showAddCat = ref(false)

async function loadCushion() {
  const res = await api.get('/finance/cushion')
  cushion.value = res.data
}

async function addCushionContribution() {
  if (!cushionAddAmount.value) return
  const res = await api.post('/finance/cushion/contributions', {
    amount: Number(cushionAddAmount.value),
    note: cushionAddNote.value,
    date: cushionAddDate.value,
  })
  cushion.value = res.data
  cushionAddAmount.value = ''
  cushionAddNote.value = ''
  cushionAddDate.value = new Date().toISOString().slice(0, 10)
}

async function deleteCushionEntry(id: string) {
  const res = await api.delete(`/finance/cushion/contributions/${id}`)
  cushion.value = res.data
}

async function saveCushionGoal() {
  const res = await api.put('/finance/cushion/goal', { goal: cushionGoalInput.value })
  cushion.value = res.data
  editingCushionGoal.value = false
}

async function loadAll() {
  const [catRes, txRes, statsRes] = await Promise.all([
    api.get('/finance/categories'),
    api.get('/finance/transactions', { params: { type: filterType.value || undefined, categoryId: filterCategory.value || undefined, year: filterYear.value || undefined, month: filterMonth.value || undefined, search: searchTx.value || undefined } }),
    api.get('/finance/stats', { params: { year: filterYear.value || undefined, month: filterMonth.value || undefined } })
  ])
  categories.value = catRes.data
  transactions.value = txRes.data
  stats.value = statsRes.data
  await Promise.all([loadDebts(), loadCushion()])
}

async function addTransaction() {
  await api.post('/finance/transactions', { ...newTx.value, amount: Number(newTx.value.amount), categoryId: newTx.value.categoryId || null })
  showAddTx.value = false
  newTx.value = { type: 'expense', amount: '', description: '', categoryId: '', date: new Date().toISOString().slice(0, 10) }
  await loadAll()
}

async function deleteTx(id: string) {
  await api.delete(`/finance/transactions/${id}`)
  await loadAll()
}

async function addCategory() {
  await api.post('/finance/categories', newCat.value)
  showAddCat.value = false
  newCat.value = { name: '', color: '#6366f1', icon: '📁' }
  await loadAll()
}

async function deleteCategory(id: string) {
  await api.delete(`/finance/categories/${id}`)
  await loadAll()
}

function getCat(id: string | null) {
  return categories.value.find(c => c.id === id)
}

const pieData = computed(() => ({
  labels: stats.value?.byCategory.map(c => c.name) || [],
  datasets: [{ data: stats.value?.byCategory.map(c => c.total) || [], backgroundColor: stats.value?.byCategory.map(c => c.color) || [] }]
}))

const barData = computed(() => ({
  labels: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
  datasets: [
    { label: 'Доходы', data: stats.value?.monthly.map(m => m.income) || [], backgroundColor: '#22c55e' },
    { label: 'Расходы', data: stats.value?.monthly.map(m => m.expense) || [], backgroundColor: '#ef4444' }
  ]
}))

const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' as const } } }

onMounted(loadAll)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Финансы</h1>
      <Button @click="showAddTx = true"><Plus class="w-4 h-4 mr-2" />Добавить</Button>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 border-b overflow-x-auto">
      <button v-for="t in [['dashboard','Дашборд'],['history','История'],['categories','Категории'],['debts','Долги']]" :key="t[0]"
        class="whitespace-nowrap flex-shrink-0"
        :class="['px-4 py-2 text-sm font-medium border-b-2 transition-colors', tab === t[0] ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground']"
        @click="tab = t[0] as any"
      >{{ t[1] }}</button>
    </div>

    <!-- Dashboard -->
    <div v-if="tab === 'dashboard'" class="space-y-4">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card class="p-4 flex items-center gap-3">
          <div class="p-2 rounded-full bg-green-100 dark:bg-green-900"><TrendingUp class="w-5 h-5 text-green-600" /></div>
          <div><p class="text-sm text-muted-foreground">Доходы</p><p class="text-xl font-bold text-green-600">{{ formatCurrency(stats?.totalIncome || 0) }}</p></div>
        </Card>
        <Card class="p-4 flex items-center gap-3">
          <div class="p-2 rounded-full bg-red-100 dark:bg-red-900"><TrendingDown class="w-5 h-5 text-red-600" /></div>
          <div><p class="text-sm text-muted-foreground">Расходы</p><p class="text-xl font-bold text-red-600">{{ formatCurrency(stats?.totalExpense || 0) }}</p></div>
        </Card>
        <Card class="p-4 flex items-center gap-3">
          <div class="p-2 rounded-full bg-blue-100 dark:bg-blue-900"><Wallet class="w-5 h-5 text-blue-600" /></div>
          <div><p class="text-sm text-muted-foreground">Баланс</p><p class="text-xl font-bold" :class="(stats?.balance || 0) >= 0 ? 'text-green-600' : 'text-red-600'">{{ formatCurrency(stats?.balance || 0) }}</p></div>
        </Card>
        <!-- Копилка -->
        <Card class="p-4 cursor-pointer hover:bg-accent/30 transition-colors" @click="showCushionModal = true">
          <div class="flex items-center gap-3 mb-2">
            <div class="p-2 rounded-full bg-violet-100 dark:bg-violet-900"><PiggyBank class="w-5 h-5 text-violet-600" /></div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-muted-foreground">Копилка</p>
              <p class="text-xl font-bold text-violet-600">{{ formatCurrency(cushionTotal) }}</p>
            </div>
          </div>
          <div v-if="cushion.goal > 0">
            <div class="h-1.5 rounded-full bg-muted overflow-hidden mb-1">
              <div class="h-full rounded-full bg-violet-500 transition-all" :style="`width: ${cushionPct}%`" />
            </div>
            <p class="text-xs text-muted-foreground">{{ cushionPct }}% из {{ formatCurrency(cushion.goal) }}</p>
          </div>
          <p v-else class="text-xs text-muted-foreground">Нажмите чтобы пополнить</p>
        </Card>
      </div>

      <div class="flex gap-2 items-center">
        <select v-model="filterYear" @change="loadAll" class="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Всё время</option>
          <option v-for="y in [2024,2025,2026,2027]" :key="y" :value="y">{{ y }}</option>
        </select>
        <select v-model="filterMonth" @change="loadAll" class="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Весь год</option>
          <option v-for="m in 12" :key="m" :value="m">{{ new Date(2000, m-1).toLocaleString('ru', { month: 'long' }) }}</option>
        </select>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card class="p-4">
          <h3 class="font-semibold mb-3">По месяцам</h3>
          <div class="h-48"><Bar :data="barData" :options="chartOptions" /></div>
        </Card>
        <Card class="p-4">
          <h3 class="font-semibold mb-3">Расходы по категориям</h3>
          <div class="h-48">
            <Pie v-if="pieData.labels.length" :data="pieData" :options="chartOptions" />
            <p v-else class="text-sm text-muted-foreground text-center mt-12">Нет данных</p>
          </div>
        </Card>
      </div>
    </div>

    <!-- History -->
    <div v-if="tab === 'history'" class="space-y-3">
      <div class="space-y-2">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input v-model="searchTx" placeholder="Поиск..." class="pl-9 w-full" @input="loadAll" />
        </div>
        <div class="flex gap-2">
          <select v-model="filterType" @change="loadAll" class="flex-1 h-10 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Все</option><option value="income">Доходы</option><option value="expense">Расходы</option>
          </select>
          <select v-model="filterCategory" @change="loadAll" class="flex-1 h-10 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Все категории</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.icon }} {{ c.name }}</option>
          </select>
        </div>
      </div>

      <div class="space-y-2">
        <Card v-for="tx in transactions" :key="tx.id" class="p-3 flex items-center gap-3">
          <div :class="['w-2 h-8 rounded-full', tx.type === 'income' ? 'bg-green-500' : 'bg-red-500']" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ tx.description || '—' }}</p>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-xs text-muted-foreground">{{ formatDate(tx.date) }}</span>
              <Badge v-if="getCat(tx.categoryId)" variant="outline" class="text-xs" :style="`border-color: ${getCat(tx.categoryId)?.color}`">{{ getCat(tx.categoryId)?.icon }} {{ getCat(tx.categoryId)?.name }}</Badge>
            </div>
          </div>
          <span :class="['font-semibold', tx.type === 'income' ? 'text-green-600' : 'text-red-600']">{{ tx.type === 'income' ? '+' : '-' }}{{ formatCurrency(tx.amount) }}</span>
          <Button size="icon" variant="ghost" class="text-destructive hover:text-destructive h-8 w-8" @click="deleteTx(tx.id)"><Trash2 class="w-3.5 h-3.5" /></Button>
        </Card>
        <p v-if="transactions.length === 0" class="text-sm text-muted-foreground text-center py-8">Нет транзакций</p>
      </div>
    </div>

    <!-- Categories -->
    <div v-if="tab === 'categories'" class="space-y-3">
      <Button variant="outline" @click="showAddCat = true"><Plus class="w-4 h-4 mr-2" />Новая категория</Button>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <Card v-for="cat in categories" :key="cat.id" class="p-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-lg">{{ cat.icon }}</span>
            <span class="text-sm font-medium">{{ cat.name }}</span>
          </div>
          <Button size="icon" variant="ghost" class="text-destructive hover:text-destructive h-7 w-7" @click="deleteCategory(cat.id)"><Trash2 class="w-3 h-3" /></Button>
        </Card>
      </div>
    </div>

    <!-- Debts -->
    <div v-if="tab === 'debts'" class="space-y-4">
      <!-- Summary cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card class="p-4 space-y-2">
          <div class="flex items-center gap-2">
            <div class="p-2 rounded-full bg-red-100 dark:bg-red-900"><HandCoins class="w-4 h-4 text-red-600" /></div>
            <p class="font-medium text-sm">Я должен</p>
          </div>
          <p class="text-2xl font-bold text-red-600">{{ formatCurrency(debtSummary.iOweRemaining) }}</p>
          <div class="h-1.5 rounded-full bg-muted overflow-hidden">
            <div class="h-full rounded-full bg-red-500 transition-all" :style="`width: ${debtSummary.iOweTotal ? Math.round(debtSummary.iOwePaid / debtSummary.iOweTotal * 100) : 0}%`" />
          </div>
          <p class="text-xs text-muted-foreground">Отдано {{ formatCurrency(debtSummary.iOwePaid) }} из {{ formatCurrency(debtSummary.iOweTotal) }}</p>
        </Card>
        <Card class="p-4 space-y-2">
          <div class="flex items-center gap-2">
            <div class="p-2 rounded-full bg-green-100 dark:bg-green-900"><HandCoins class="w-4 h-4 text-green-600" /></div>
            <p class="font-medium text-sm">Мне должны</p>
          </div>
          <p class="text-2xl font-bold text-green-600">{{ formatCurrency(debtSummary.owedRemaining) }}</p>
          <div class="h-1.5 rounded-full bg-muted overflow-hidden">
            <div class="h-full rounded-full bg-green-500 transition-all" :style="`width: ${debtSummary.owedTotal ? Math.round(debtSummary.owedPaid / debtSummary.owedTotal * 100) : 0}%`" />
          </div>
          <p class="text-xs text-muted-foreground">Получено {{ formatCurrency(debtSummary.owedPaid) }} из {{ formatCurrency(debtSummary.owedTotal) }}</p>
        </Card>
      </div>

      <Button @click="showAddDebt = true"><Plus class="w-4 h-4 mr-2" />Добавить долг</Button>

      <!-- Debt list -->
      <div class="space-y-3">
        <Card v-for="debt in debts" :key="debt.id" class="overflow-hidden">
          <!-- Debt header -->
          <div
            class="p-4 flex items-center gap-3 cursor-pointer hover:bg-accent/50 transition-colors"
            @click="expandedDebtId = expandedDebtId === debt.id ? null : debt.id"
          >
            <div :class="['w-2 h-10 rounded-full flex-shrink-0', debt.direction === 'owe' ? 'bg-red-500' : 'bg-green-500']" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="font-medium text-sm truncate">{{ debt.name }}</p>
                <span :class="['text-xs px-1.5 py-0.5 rounded-full font-medium', debt.direction === 'owe' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300']">
                  {{ debt.direction === 'owe' ? 'Я должен' : 'Мне должны' }}
                </span>
              </div>
              <div class="flex items-center gap-3 mt-1.5">
                <div class="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    :class="['h-full rounded-full transition-all', debt.direction === 'owe' ? 'bg-red-500' : 'bg-green-500']"
                    :style="`width: ${debtProgress(debt)}%`"
                  />
                </div>
                <span class="text-xs text-muted-foreground flex-shrink-0">{{ debtProgress(debt) }}%</span>
              </div>
              <p class="text-xs text-muted-foreground mt-1">
                Осталось <span class="font-semibold text-foreground">{{ formatCurrency(remainingAmount(debt)) }}</span>
                из {{ formatCurrency(debt.totalAmount) }}
                <span v-if="debt.dueDate"> · до {{ formatDate(debt.dueDate) }}</span>
              </p>
              <p v-if="monthsLeft(debt) !== null" class="text-xs mt-0.5">
                <span class="font-medium" :class="debt.direction === 'owe' ? 'text-orange-500' : 'text-blue-500'">
                  ~{{ monthsLeft(debt) }} {{ monthsLeft(debt) === 1 ? 'месяц' : monthsLeft(debt)! <= 4 ? 'месяца' : 'месяцев' }}
                </span>
                <span class="text-muted-foreground"> · {{ formatCurrency(debt.monthlyPayment!) }}/мес</span>
              </p>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              <Button size="icon" variant="ghost" class="text-destructive hover:text-destructive h-7 w-7" @click.stop="deleteDebt(debt.id)"><Trash2 class="w-3 h-3" /></Button>
              <ChevronDown v-if="expandedDebtId !== debt.id" class="w-4 h-4 text-muted-foreground" />
              <ChevronUp v-else class="w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          <!-- Payments -->
          <div v-if="expandedDebtId === debt.id" class="border-t bg-muted/30">
            <div class="p-3 space-y-2">
              <!-- Monthly payment edit -->
              <div class="flex items-center gap-2 pb-1 border-b">
                <span class="text-xs text-muted-foreground">Ежемесячный платёж:</span>
                <Input
                  :modelValue="debt.monthlyPayment ?? ''"
                  type="number"
                  placeholder="не указан"
                  class="h-7 text-xs w-32"
                  @change="api.put(`/finance/debts/${debt.id}`, { monthlyPayment: ($event.target as HTMLInputElement).value || null }).then(loadDebts)"
                />
                <span v-if="debt.monthlyPayment" class="text-xs text-muted-foreground">→ {{ monthsLeft(debt) }} мес. осталось</span>
              </div>
              <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">История платежей</p>
              <div v-for="p in debt.payments" :key="p.id" class="flex items-center gap-3 text-sm">
                <span class="text-muted-foreground w-20 flex-shrink-0">{{ p.date }}</span>
                <span class="font-medium text-green-600">{{ formatCurrency(p.amount) }}</span>
                <span v-if="p.note" class="text-muted-foreground truncate">{{ p.note }}</span>
                <Button size="icon" variant="ghost" class="text-destructive hover:text-destructive h-6 w-6 ml-auto flex-shrink-0" @click="deletePayment(debt.id, p.id)"><Trash2 class="w-3 h-3" /></Button>
              </div>
              <p v-if="debt.payments.length === 0" class="text-xs text-muted-foreground">Платежей нет</p>

              <!-- Add payment inline -->
              <div v-if="showAddPayment === debt.id" class="flex gap-2 flex-wrap pt-1">
                <Input v-model="newPayment.amount" type="number" placeholder="Сумма" class="w-28 h-8 text-sm" />
                <Input v-model="newPayment.date" type="date" class="w-36 h-8 text-sm" />
                <Input v-model="newPayment.note" placeholder="Заметка" class="flex-1 min-w-24 h-8 text-sm" />
                <Button size="sm" class="h-8" @click="addPayment(debt.id)" :disabled="!newPayment.amount">Добавить</Button>
                <Button size="sm" variant="ghost" class="h-8" @click="showAddPayment = null">✕</Button>
              </div>
              <Button v-else variant="outline" size="sm" class="h-8 text-xs" @click="showAddPayment = debt.id; newPayment = { amount: '', note: '', date: new Date().toISOString().slice(0,10) }">
                <Plus class="w-3 h-3 mr-1" />Внести платёж
              </Button>
            </div>
          </div>
        </Card>

        <p v-if="debts.length === 0" class="text-sm text-muted-foreground text-center py-8">Нет долгов. Хорошее начало!</p>
      </div>
    </div>

    <!-- Add Debt Modal -->
    <div v-if="showAddDebt" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card class="w-full max-w-sm p-6 space-y-4">
        <h2 class="font-semibold text-lg">Новый долг</h2>
        <div class="space-y-3">
          <div class="flex gap-2">
            <Button :variant="newDebt.direction === 'owe' ? 'default' : 'outline'" class="flex-1 text-sm" @click="newDebt.direction = 'owe'">Я должен</Button>
            <Button :variant="newDebt.direction === 'owed' ? 'default' : 'outline'" class="flex-1 text-sm" @click="newDebt.direction = 'owed'">Мне должны</Button>
          </div>
          <div class="space-y-1.5"><Label>Название / Кому</Label><Input v-model="newDebt.name" placeholder="Пете, за ноутбук..." /></div>
          <div class="space-y-1.5"><Label>Сумма</Label><Input v-model="newDebt.totalAmount" type="number" placeholder="0" /></div>
          <div class="space-y-1.5"><Label>Ежемесячный платёж (необязательно)</Label><Input v-model="newDebt.monthlyPayment" type="number" placeholder="0" /></div>
          <div class="space-y-1.5"><Label>Срок (необязательно)</Label><Input v-model="newDebt.dueDate" type="date" /></div>
          <div class="space-y-1.5"><Label>Заметка</Label><Input v-model="newDebt.note" placeholder="Подробности..." /></div>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" class="flex-1" @click="showAddDebt = false">Отмена</Button>
          <Button class="flex-1" @click="addDebt" :disabled="!newDebt.name || !newDebt.totalAmount">Добавить</Button>
        </div>
      </Card>
    </div>

    <!-- Add Transaction Modal -->
    <div v-if="showAddTx" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card class="w-full max-w-sm p-6 space-y-4">
        <h2 class="font-semibold text-lg">Новая транзакция</h2>
        <div class="space-y-3">
          <div class="flex gap-2">
            <Button :variant="newTx.type === 'expense' ? 'default' : 'outline'" class="flex-1" @click="newTx.type = 'expense'">Расход</Button>
            <Button :variant="newTx.type === 'income' ? 'default' : 'outline'" class="flex-1" @click="newTx.type = 'income'">Доход</Button>
          </div>
          <div class="space-y-1.5"><Label>Сумма</Label><Input v-model="newTx.amount" type="number" placeholder="0" /></div>
          <div class="space-y-1.5"><Label>Описание</Label><Input v-model="newTx.description" placeholder="За что?" /></div>
          <div class="space-y-1.5"><Label>Категория</Label>
            <select v-model="newTx.categoryId" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Без категории</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.icon }} {{ c.name }}</option>
            </select>
          </div>
          <div class="space-y-1.5"><Label>Дата</Label><Input v-model="newTx.date" type="date" /></div>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" class="flex-1" @click="showAddTx = false">Отмена</Button>
          <Button class="flex-1" @click="addTransaction" :disabled="!newTx.amount">Добавить</Button>
        </div>
      </Card>
    </div>

    <!-- Cushion Modal -->
    <div v-if="showCushionModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card class="w-full max-w-md p-6 space-y-4 max-h-[85vh] flex flex-col">
        <div class="flex items-center justify-between flex-shrink-0">
          <div class="flex items-center gap-2">
            <PiggyBank class="w-5 h-5 text-violet-600" />
            <h2 class="font-semibold text-lg">Копилка</h2>
          </div>
          <button @click="showCushionModal = false"><X class="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <!-- Total + goal -->
        <div class="rounded-xl bg-violet-500/10 p-4 space-y-2 flex-shrink-0">
          <div class="flex items-end justify-between">
            <div>
              <p class="text-xs text-muted-foreground">Накоплено</p>
              <p class="text-3xl font-bold text-violet-600">{{ formatCurrency(cushionTotal) }}</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-muted-foreground">Цель</p>
              <div v-if="!editingCushionGoal" class="flex items-center gap-1">
                <p class="text-sm font-medium">{{ cushion.goal > 0 ? formatCurrency(cushion.goal) : 'не задана' }}</p>
                <button @click="editingCushionGoal = true; cushionGoalInput = cushion.goal" class="text-muted-foreground hover:text-foreground"><Pencil class="w-3 h-3" /></button>
              </div>
              <div v-else class="flex items-center gap-1">
                <Input v-model.number="cushionGoalInput" type="number" class="h-7 w-32 text-sm" @keyup.enter="saveCushionGoal" />
                <button @click="saveCushionGoal" class="text-violet-600"><X class="w-3 h-3 rotate-45" /></button>
              </div>
            </div>
          </div>
          <div v-if="cushion.goal > 0">
            <div class="h-2 rounded-full bg-violet-200 dark:bg-violet-900 overflow-hidden">
              <div class="h-full rounded-full bg-violet-500 transition-all" :style="`width: ${cushionPct}%`" />
            </div>
            <p class="text-xs text-muted-foreground mt-1">{{ cushionPct }}% · осталось {{ formatCurrency(Math.max(0, cushion.goal - cushionTotal)) }}</p>
          </div>
        </div>

        <!-- Add contribution -->
        <div class="space-y-2 flex-shrink-0">
          <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Пополнить</p>
          <div class="flex gap-2">
            <Input v-model="cushionAddAmount" type="number" placeholder="Сумма" class="w-32 h-9" />
            <Input v-model="cushionAddNote" placeholder="Заметка (необязательно)" class="flex-1 h-9" />
            <Input v-model="cushionAddDate" type="date" class="w-36 h-9" />
          </div>
          <Button class="w-full h-9" @click="addCushionContribution" :disabled="!cushionAddAmount">
            <Plus class="w-4 h-4 mr-2" />Добавить
          </Button>
        </div>

        <!-- History -->
        <div class="flex-1 overflow-auto space-y-1 min-h-0">
          <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">История</p>
          <p v-if="cushion.contributions.length === 0" class="text-sm text-muted-foreground text-center py-4">Пока пусто</p>
          <div v-for="entry in [...cushion.contributions].reverse()" :key="entry.id"
            class="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-violet-600">+{{ formatCurrency(entry.amount) }}</p>
              <p class="text-xs text-muted-foreground">{{ entry.date }}{{ entry.note ? ' · ' + entry.note : '' }}</p>
            </div>
            <button class="text-muted-foreground hover:text-destructive p-1" @click="deleteCushionEntry(entry.id)">
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </Card>
    </div>

    <!-- Add Category Modal -->
    <div v-if="showAddCat" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card class="w-full max-w-sm p-6 space-y-4">
        <h2 class="font-semibold text-lg">Новая категория</h2>
        <div class="space-y-3">
          <div class="space-y-1.5"><Label>Название</Label><Input v-model="newCat.name" placeholder="Продукты" /></div>
          <div class="space-y-1.5"><Label>Иконка</Label><Input v-model="newCat.icon" placeholder="🛒" /></div>
          <div class="space-y-1.5"><Label>Цвет</Label><input v-model="newCat.color" type="color" class="h-10 w-full rounded-md border border-input bg-background px-2 cursor-pointer" /></div>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" class="flex-1" @click="showAddCat = false">Отмена</Button>
          <Button class="flex-1" @click="addCategory" :disabled="!newCat.name">Создать</Button>
        </div>
      </Card>
    </div>
  </div>
</template>
