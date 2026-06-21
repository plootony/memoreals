<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import api from '@/api'
import { formatDate } from '@/lib/utils'
import { pickAndUpload } from '@/lib/uploadImage'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Card from '@/components/ui/Card.vue'
import { Plus, Search, ChevronLeft, Trash2, Bold, Italic, List, ListOrdered, Image as ImageIcon, BookOpen, Loader2, Images, X } from 'lucide-vue-next'

interface JournalEntry {
  id: string; title: string; content: string
  date: string; mood: string; photos: string[]
  createdAt: string; updatedAt: string
}

const MOODS = [
  { value: 'joy',       emoji: '😊', label: 'Радость' },
  { value: 'love',      emoji: '🥰', label: 'Любовь' },
  { value: 'inspired',  emoji: '✨', label: 'Вдохновение' },
  { value: 'calm',      emoji: '😌', label: 'Спокойствие' },
  { value: 'tired',     emoji: '😴', label: 'Усталость' },
  { value: 'sad',       emoji: '😔', label: 'Грусть' },
  { value: 'anxious',   emoji: '😰', label: 'Тревога' },
  { value: 'angry',     emoji: '😠', label: 'Злость' },
  { value: 'confused',  emoji: '😕', label: 'Растерянность' },
]

function moodEmoji(val: string) { return MOODS.find(m => m.value === val)?.emoji ?? '' }

const entries = ref<JournalEntry[]>([])
const selected = ref<JournalEntry | null>(null)
const isEditing = ref(false)
const search = ref('')
const filterYear = ref('')
const filterMonth = ref('')
const loading = ref(false)
const imageUploading = ref(false)
const showGalleryPicker = ref(false)
const galleryPhotos = ref<{ id: string; url: string }[]>([])

const editTitle = ref('')
const editDate  = ref(new Date().toISOString().slice(0, 10))
const editMood  = ref('')

const editor = useEditor({
  extensions: [
    StarterKit,
    Image.configure({ inline: false }),
    Placeholder.configure({ placeholder: 'Начните писать...' }),
  ],
  editorProps: {
    attributes: { class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[200px] p-4' }
  }
})

const filteredEntries = computed(() => {
  let list = entries.value
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(e => e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q))
  }
  return list
})

const years = computed(() => {
  const ys = new Set(entries.value.map(e => new Date(e.date).getFullYear()))
  return [...ys].sort((a, b) => b - a)
})

async function load() {
  loading.value = true
  try {
    const params: any = {}
    if (filterYear.value) params.year = filterYear.value
    if (filterMonth.value) params.month = filterMonth.value
    if (search.value) params.search = search.value
    const res = await api.get('/journal', { params })
    entries.value = res.data
  } finally {
    loading.value = false
  }
}

function openNew() {
  selected.value = null
  isEditing.value = true
  editTitle.value = ''
  editDate.value = new Date().toISOString().slice(0, 10)
  editMood.value = ''
  editor.value?.commands.clearContent()
}

function openEntry(entry: JournalEntry) {
  selected.value = entry
  isEditing.value = false
  editTitle.value = entry.title
  editDate.value = entry.date.slice(0, 10)
  editMood.value = entry.mood || ''
  editor.value?.commands.setContent(entry.content)
}

function startEdit() { isEditing.value = true }

async function save() {
  const content = editor.value?.getHTML() || ''
  const payload = { title: editTitle.value, content, date: editDate.value, mood: editMood.value }
  if (selected.value) {
    const res = await api.put(`/journal/${selected.value.id}`, payload)
    const idx = entries.value.findIndex(e => e.id === selected.value!.id)
    if (idx !== -1) entries.value[idx] = res.data
    selected.value = res.data
    // Re-sort since date might have changed
    entries.value.sort((a, b) => b.date.localeCompare(a.date))
  } else {
    const res = await api.post('/journal', payload)
    entries.value.unshift(res.data)
    entries.value.sort((a, b) => b.date.localeCompare(a.date))
    selected.value = res.data
  }
  isEditing.value = false
}

async function deleteEntry(id: string) {
  await api.delete(`/journal/${id}`)
  entries.value = entries.value.filter(e => e.id !== id)
  if (selected.value?.id === id) selected.value = null
}

async function insertImage() {
  const url = await pickAndUpload(v => imageUploading.value = v, undefined, 'journal')
  if (url) editor.value?.chain().focus().setImage({ src: url }).run()
}

async function openGalleryPicker() {
  const r = await api.get('/gallery')
  galleryPhotos.value = r.data.photos
  showGalleryPicker.value = true
}

function insertFromGallery(url: string) {
  editor.value?.chain().focus().setImage({ src: url }).run()
  showGalleryPicker.value = false
}

onMounted(load)
</script>

<template>
  <div class="flex flex-col md:flex-row gap-4 h-full">
    <!-- List panel -->
    <div :class="['md:w-72 md:flex-shrink-0 flex-col gap-3', (selected || isEditing) ? 'hidden md:flex' : 'flex']">
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input v-model="search" placeholder="Поиск..." class="pl-9" @input="load" />
        </div>
        <Button size="icon" @click="openNew"><Plus class="w-4 h-4" /></Button>
      </div>

      <div class="flex gap-2">
        <select v-model="filterYear" @change="load" class="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Все годы</option>
          <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
        </select>
        <select v-model="filterMonth" @change="load" class="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Все месяцы</option>
          <option v-for="m in 12" :key="m" :value="m">{{ new Date(2000, m-1).toLocaleString('ru', { month: 'long' }) }}</option>
        </select>
      </div>

      <div class="flex-1 overflow-auto space-y-2">
        <Card v-for="entry in filteredEntries" :key="entry.id"
          class="p-3 cursor-pointer hover:bg-accent transition-colors"
          :class="{ 'border-primary': selected?.id === entry.id }"
          @click="openEntry(entry)">
          <div class="flex items-center gap-1.5">
            <span v-if="entry.mood" class="text-base leading-none flex-shrink-0">{{ moodEmoji(entry.mood) }}</span>
            <p class="font-medium text-sm truncate">{{ entry.title || 'Без названия' }}</p>
          </div>
          <p class="text-xs text-muted-foreground mt-1">{{ formatDate(entry.date) }}</p>
          <p class="text-xs text-muted-foreground truncate mt-1" v-html="entry.content.replace(/<[^>]*>/g, ' ').slice(0, 60)" />
        </Card>
        <p v-if="filteredEntries.length === 0" class="text-sm text-muted-foreground text-center py-8">Нет записей</p>
      </div>
    </div>

    <!-- Editor panel -->
    <Card :class="['flex-1 flex-col overflow-hidden', (!selected && !isEditing) ? 'hidden md:flex' : 'flex']">
      <div v-if="!selected && !isEditing" class="flex-1 flex items-center justify-center text-muted-foreground">
        <div class="text-center">
          <BookOpen class="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Выберите запись или создайте новую</p>
        </div>
      </div>

      <template v-else>
        <!-- Toolbar -->
        <div class="flex items-center gap-2 p-3 border-b flex-wrap">
          <button class="md:hidden p-1 text-muted-foreground hover:text-foreground mr-1"
            @click="selected = null; isEditing = false">
            <ChevronLeft class="w-5 h-5" />
          </button>
          <Input v-model="editTitle" placeholder="Заголовок"
            class="flex-1 min-w-0 h-9 border-0 shadow-none text-base font-medium focus-visible:ring-0 px-0"
            :disabled="!isEditing" />
          <div class="flex items-center gap-2 ml-auto">
            <Button v-if="isEditing" variant="outline" size="sm" @click="isEditing = false; editor?.setEditable(false)">Отмена</Button>
            <Button v-if="isEditing" size="sm" @click="save">Сохранить</Button>
            <Button v-else size="sm" variant="outline" @click="startEdit">Редактировать</Button>
            <Button v-if="selected" size="icon" variant="ghost" class="text-destructive hover:text-destructive"
              @click="deleteEntry(selected.id)"><Trash2 class="w-4 h-4" /></Button>
          </div>
        </div>

        <!-- Date + mood (only in edit mode) -->
        <div v-if="isEditing" class="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/30 flex-wrap gap-y-2">
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">Дата:</span>
            <input v-model="editDate" type="date"
              class="h-7 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-xs text-muted-foreground">Настроение:</span>
            <div class="flex gap-1 flex-wrap">
              <button v-for="m in MOODS" :key="m.value"
                :title="m.label"
                :class="['text-lg leading-none p-1 rounded-md transition-colors', editMood === m.value ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-accent']"
                @click="editMood = editMood === m.value ? '' : m.value">
                {{ m.emoji }}
              </button>
            </div>
          </div>

          <!-- Format toolbar -->
          <div class="flex items-center gap-1 ml-auto">
            <Button size="icon" variant="ghost" class="h-8 w-8" :class="{ 'bg-accent': editor?.isActive('bold') }" @click="editor?.chain().focus().toggleBold().run()"><Bold class="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" class="h-8 w-8" :class="{ 'bg-accent': editor?.isActive('italic') }" @click="editor?.chain().focus().toggleItalic().run()"><Italic class="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" class="h-8 w-8" :class="{ 'bg-accent': editor?.isActive('bulletList') }" @click="editor?.chain().focus().toggleBulletList().run()"><List class="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" class="h-8 w-8" :class="{ 'bg-accent': editor?.isActive('orderedList') }" @click="editor?.chain().focus().toggleOrderedList().run()"><ListOrdered class="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" class="h-8 w-8" @click="insertImage" :disabled="imageUploading" title="Загрузить фото">
              <Loader2 v-if="imageUploading" class="w-3.5 h-3.5 animate-spin" />
              <ImageIcon v-else class="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" class="h-8 w-8" @click="openGalleryPicker" title="Из галереи">
              <Images class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-auto">
          <EditorContent :editor="editor" :editable="isEditing" />
        </div>

        <!-- Footer -->
        <div v-if="selected" class="px-4 py-2 border-t text-xs text-muted-foreground flex items-center gap-3">
          <span>{{ formatDate(selected.date) }}</span>
          <span v-if="selected.mood" class="flex items-center gap-1">
            <span class="text-base leading-none">{{ moodEmoji(selected.mood) }}</span>
            <span>{{ MOODS.find(m => m.value === selected!.mood)?.label }}</span>
          </span>
        </div>
      </template>
    </Card>
  </div>

  <!-- Gallery picker -->
  <div v-if="showGalleryPicker" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
    <div class="bg-card w-full sm:max-w-2xl rounded-t-xl sm:rounded-xl flex flex-col max-h-[85vh]">
      <div class="flex items-center justify-between p-4 border-b flex-shrink-0">
        <h2 class="font-semibold">Выбрать из галереи</h2>
        <button @click="showGalleryPicker = false"><X class="w-4 h-4 text-muted-foreground" /></button>
      </div>
      <div class="overflow-auto p-4">
        <div v-if="galleryPhotos.length === 0" class="text-center py-12 text-muted-foreground text-sm">Галерея пуста</div>
        <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-2">
          <div v-for="p in galleryPhotos" :key="p.id"
            class="aspect-square rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
            @click="insertFromGallery(p.url)">
            <img :src="p.url" class="w-full h-full object-cover" loading="lazy" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: hsl(var(--muted-foreground));
  pointer-events: none;
  height: 0;
}
.tiptap img { max-width: calc(100% - 24px); max-height: 400px; width: auto; border-radius: 0.5rem; margin: 4px 12px; display: block; object-fit: contain; }
</style>
