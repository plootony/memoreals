<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '@/api'
import { uploadImage } from '@/lib/uploadImage'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'
import Label from '@/components/ui/Label.vue'
import { Plus, Trash2, Pencil, X, ExternalLink, ShoppingCart, Check, ImagePlus, Loader2, Tag } from 'lucide-vue-next'

interface WishItem {
  id: string; title: string; category: string; url: string | null
  price: number | null; priority: 'want' | 'need' | 'must'
  image: string | null; note: string; purchased: boolean; createdAt: string
}
interface WishlistData { items: WishItem[]; categories: string[] }

const data = ref<WishlistData>({ items: [], categories: [] })
const filterCategory = ref('')
const filterPriority = ref('')
const showPurchased = ref(false)
const showForm = ref(false)
const editingId = ref<string | null>(null)
const imageUploading = ref(false)
const newCategory = ref('')
const showCatForm = ref(false)

const priorities = [
  { value: 'want', label: 'Хочу',   color: 'text-blue-500',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
  { value: 'need', label: 'Нужно',  color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  { value: 'must', label: 'Срочно', color: 'text-red-500',    bg: 'bg-red-500/10',    border: 'border-red-500/30' },
]
const getPriority = (p: string) => priorities.find(x => x.value === p) || priorities[0]

const form = ref({
  title: '', category: '', url: '', price: '' as string | number,
  priority: 'want' as 'want' | 'need' | 'must', image: null as string | null, note: ''
})

async function load() {
  const res = await api.get('/wishlist')
  data.value = res.data
}

const filtered = computed(() => {
  let items = data.value.items.filter(i => showPurchased.value ? i.purchased : !i.purchased)
  if (filterCategory.value) items = items.filter(i => i.category === filterCategory.value)
  if (filterPriority.value) items = items.filter(i => i.priority === filterPriority.value)
  const order = { must: 0, need: 1, want: 2 }
  return [...items].sort((a, b) => order[a.priority] - order[b.priority])
})

const totalPrice = computed(() =>
  filtered.value.reduce((s, i) => s + (i.price || 0), 0)
)

function openNew() {
  editingId.value = null
  form.value = { title: '', category: data.value.categories[0] || '', url: '', price: '', priority: 'want', image: null, note: '' }
  showForm.value = true
}

function openEdit(item: WishItem) {
  editingId.value = item.id
  form.value = { title: item.title, category: item.category, url: item.url || '', price: item.price ?? '', priority: item.priority, image: item.image, note: item.note }
  showForm.value = true
}

async function pickImage() {
  imageUploading.value = true
  try {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) { imageUploading.value = false; return }
      const url = await uploadImage(file)
      form.value.image = url
      imageUploading.value = false
    }
    input.oncancel = () => { imageUploading.value = false }
    input.click()
  } catch { imageUploading.value = false }
}

async function save() {
  if (!form.value.title.trim()) return
  const payload = { ...form.value, price: form.value.price !== '' ? Number(form.value.price) : null, url: form.value.url || null }
  if (editingId.value) {
    await api.put(`/wishlist/items/${editingId.value}`, payload)
  } else {
    await api.post('/wishlist/items', payload)
  }
  showForm.value = false
  await load()
}

async function togglePurchased(item: WishItem) {
  await api.put(`/wishlist/items/${item.id}`, { ...item, purchased: !item.purchased })
  await load()
}

async function deleteItem(id: string) {
  await api.delete(`/wishlist/items/${id}`)
  data.value.items = data.value.items.filter(i => i.id !== id)
}

async function addCategory() {
  if (!newCategory.value.trim()) return
  const cats = [...data.value.categories, newCategory.value.trim()]
  await api.put('/wishlist/categories', { categories: cats })
  data.value.categories = cats
  newCategory.value = ''
}

async function removeCategory(cat: string) {
  const cats = data.value.categories.filter(c => c !== cat)
  await api.put('/wishlist/categories', { categories: cats })
  data.value.categories = cats
}

function formatPrice(p: number | null) {
  if (!p) return null
  return p.toLocaleString('ru') + ' ₽'
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <h1 class="text-2xl font-bold">Вишлист</h1>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" @click="showCatForm = !showCatForm">
          <Tag class="w-4 h-4 mr-1.5" />Категории
        </Button>
        <Button @click="openNew"><Plus class="w-4 h-4 mr-2" />Добавить</Button>
      </div>
    </div>

    <!-- Category manager -->
    <div v-if="showCatForm" class="p-3 border rounded-xl bg-card space-y-2">
      <div class="flex flex-wrap gap-1.5">
        <span v-for="cat in data.categories" :key="cat"
          class="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full">
          {{ cat }}
          <button @click="removeCategory(cat)" class="text-muted-foreground hover:text-destructive">
            <X class="w-2.5 h-2.5" />
          </button>
        </span>
      </div>
      <div class="flex gap-2">
        <Input v-model="newCategory" placeholder="Новая категория..." class="h-8 text-sm" @keyup.enter="addCategory" />
        <Button size="sm" variant="outline" class="h-8" @click="addCategory" :disabled="!newCategory.trim()">
          <Plus class="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>

    <!-- Filters + stats -->
    <div class="flex flex-wrap gap-2 items-center">
      <select v-model="filterCategory" class="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="">Все категории</option>
        <option v-for="c in data.categories" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-model="filterPriority" class="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="">Все приоритеты</option>
        <option v-for="p in priorities" :key="p.value" :value="p.value">{{ p.label }}</option>
      </select>
      <button
        :class="['h-9 px-3 rounded-md text-sm border transition-colors', showPurchased ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-input text-muted-foreground hover:text-foreground']"
        @click="showPurchased = !showPurchased">
        <Check class="w-3.5 h-3.5 inline mr-1.5" />Куплено
      </button>
      <span v-if="totalPrice > 0" class="ml-auto text-sm font-medium text-muted-foreground">
        Итого: <span class="text-foreground">{{ formatPrice(totalPrice) }}</span>
      </span>
    </div>

    <!-- Grid -->
    <div v-if="filtered.length === 0" class="text-sm text-muted-foreground text-center py-16">
      {{ showPurchased ? 'Нет купленных товаров' : 'Список пуст. Добавьте первый!' }}
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      <Card v-for="item in filtered" :key="item.id"
        :class="['overflow-hidden flex flex-col group', item.purchased ? 'opacity-60' : '']">
        <!-- Image -->
        <div class="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
          <img v-if="item.image" :src="item.image" class="w-full h-full object-cover" />
          <ShoppingCart v-else class="w-10 h-10 text-muted-foreground/30" />
          <!-- Actions overlay -->
          <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button class="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white" @click="openEdit(item)">
              <Pencil class="w-4 h-4" />
            </button>
            <button class="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white" @click="togglePurchased(item)"
              :title="item.purchased ? 'Не куплено' : 'Отметить купленным'">
              <Check class="w-4 h-4" />
            </button>
            <button class="p-2 rounded-full bg-white/10 hover:bg-red-500/70 text-white" @click="deleteItem(item.id)">
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
          <!-- Priority badge -->
          <span :class="['absolute top-1.5 left-1.5 text-xs px-1.5 py-0.5 rounded-full border font-medium',
            getPriority(item.priority).bg, getPriority(item.priority).color, getPriority(item.priority).border]">
            {{ getPriority(item.priority).label }}
          </span>
        </div>

        <!-- Info -->
        <div class="p-2.5 flex flex-col gap-1 flex-1">
          <p :class="['text-sm font-medium leading-tight line-clamp-2', item.purchased ? 'line-through text-muted-foreground' : '']">
            {{ item.title }}
          </p>
          <div class="flex items-center justify-between mt-auto pt-1">
            <span v-if="item.price" class="text-sm font-semibold">{{ formatPrice(item.price) }}</span>
            <span v-if="item.category" class="text-xs text-muted-foreground truncate ml-auto">{{ item.category }}</span>
          </div>
          <a v-if="item.url" :href="item.url" target="_blank" rel="noopener"
            class="flex items-center gap-1 text-xs text-primary hover:underline mt-0.5 truncate">
            <ExternalLink class="w-3 h-3 flex-shrink-0" />Открыть
          </a>
        </div>
      </Card>
    </div>
  </div>

  <!-- Form modal -->
  <div v-if="showForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <Card class="w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-auto">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-lg">{{ editingId ? 'Редактировать' : 'Новый товар' }}</h2>
        <button @click="showForm = false"><X class="w-4 h-4 text-muted-foreground" /></button>
      </div>

      <!-- Image picker -->
      <div class="flex gap-3 items-start">
        <div class="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
          <img v-if="form.image" :src="form.image" class="w-full h-full object-cover" />
          <ShoppingCart v-else class="w-8 h-8 text-muted-foreground/30" />
        </div>
        <div class="flex flex-col gap-2 flex-1">
          <Button variant="outline" size="sm" @click="pickImage" :disabled="imageUploading" class="w-full">
            <Loader2 v-if="imageUploading" class="w-4 h-4 mr-2 animate-spin" />
            <ImagePlus v-else class="w-4 h-4 mr-2" />
            {{ imageUploading ? 'Загрузка...' : 'Фото товара' }}
          </Button>
          <button v-if="form.image" @click="form.image = null"
            class="text-xs text-muted-foreground hover:text-destructive text-left">
            Убрать фото
          </button>
        </div>
      </div>

      <div class="space-y-3">
        <div class="space-y-1">
          <Label>Название *</Label>
          <Input v-model="form.title" placeholder="iPhone 16, кроссовки Nike..." />
        </div>

        <!-- Priority -->
        <div class="space-y-1">
          <Label>Критичность</Label>
          <div class="grid grid-cols-3 gap-2">
            <button v-for="p in priorities" :key="p.value"
              :class="['py-2 rounded-lg text-sm font-medium border transition-colors',
                form.priority === p.value ? [p.bg, p.color, p.border] : 'bg-muted text-muted-foreground border-transparent hover:border-border']"
              @click="form.priority = p.value as any">
              {{ p.label }}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <Label>Категория</Label>
            <select v-model="form.category" class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Без категории</option>
              <option v-for="c in data.categories" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="space-y-1">
            <Label>Цена (₽)</Label>
            <Input v-model="form.price" type="number" min="0" placeholder="0" />
          </div>
        </div>

        <div class="space-y-1">
          <Label>Ссылка</Label>
          <Input v-model="form.url" type="url" placeholder="https://..." />
        </div>

        <div class="space-y-1">
          <Label>Заметка</Label>
          <Input v-model="form.note" placeholder="Размер, цвет, комментарий..." />
        </div>
      </div>

      <div class="flex gap-2 pt-1">
        <Button variant="outline" class="flex-1" @click="showForm = false">Отмена</Button>
        <Button class="flex-1" @click="save" :disabled="!form.title.trim()">Сохранить</Button>
      </div>
    </Card>
  </div>
</template>
