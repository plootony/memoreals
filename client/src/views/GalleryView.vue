<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import api from '@/api'
import Button from '@/components/ui/Button.vue'
import { Plus, Trash2, X, ChevronLeft, ChevronRight, ImagePlus } from 'lucide-vue-next'

interface Album { id: string; name: string; isSystem: boolean; count: number }
interface Photo { id: string; url: string; albumId: string; note: string; createdAt: string }
interface DeleteConflict { usedIn: { id: string; title: string }[]; message: string; photoId: string }

const albums = ref<Album[]>([])
const photos = ref<Photo[]>([])
const activeAlbum = ref<string | null>(null)
const uploading = ref(false)
const lightbox = ref<Photo | null>(null)
const conflict = ref<DeleteConflict | null>(null)

async function load() {
  const r = await api.get('/gallery')
  albums.value = r.data.albums
  photos.value = r.data.photos
  if (!activeAlbum.value && r.data.albums.length) activeAlbum.value = null // "Все"
}

const filtered = computed(() => {
  if (!activeAlbum.value) return photos.value
  return photos.value.filter(p => p.albumId === activeAlbum.value)
})

// Группировка по дате
const grouped = computed(() => {
  const groups: Record<string, Photo[]> = {}
  for (const p of filtered.value) {
    const day = p.createdAt.slice(0, 10)
    if (!groups[day]) groups[day] = []
    groups[day].push(p)
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
})

function formatDay(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
}

function albumName(id: string) {
  return albums.value.find(a => a.id === id)?.name ?? ''
}

async function upload(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files?.length) return
  uploading.value = true
  try {
    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append('image', file)
      const r = await api.post('/gallery', form)
      photos.value.unshift(r.data)
    }
    await load()
  } finally {
    uploading.value = false;
    (e.target as HTMLInputElement).value = ''
  }
}

async function deletePhoto(photo: Photo, force = false) {
  try {
    await api.delete(`/gallery/${photo.id}${force ? '?force=true' : ''}`)
    photos.value = photos.value.filter(p => p.id !== photo.id)
    if (lightbox.value?.id === photo.id) lightbox.value = null
    conflict.value = null
  } catch (e: any) {
    if (e.response?.status === 409) {
      conflict.value = { ...e.response.data, photoId: photo.id }
    }
  }
}

// Лайтбокс навигация
function openLightbox(photo: Photo) { lightbox.value = photo }

function lightboxNext() {
  const idx = filtered.value.findIndex(p => p.id === lightbox.value?.id)
  if (idx < filtered.value.length - 1) lightbox.value = filtered.value[idx + 1]
}
function lightboxPrev() {
  const idx = filtered.value.findIndex(p => p.id === lightbox.value?.id)
  if (idx > 0) lightbox.value = filtered.value[idx - 1]
}

// Свайп на мобиле
let touchStartX = 0
function onTouchStart(e: TouchEvent) { touchStartX = e.touches[0].clientX }
function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchStartX
  if (Math.abs(dx) > 50) dx > 0 ? lightboxPrev() : lightboxNext()
}

function onKey(e: KeyboardEvent) {
  if (!lightbox.value) return
  if (e.key === 'ArrowRight') lightboxNext()
  if (e.key === 'ArrowLeft') lightboxPrev()
  if (e.key === 'Escape') lightbox.value = null
}

onMounted(() => { load(); window.addEventListener('keydown', onKey) })
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Галерея</h1>
      <label class="cursor-pointer">
        <input type="file" accept="image/*" multiple class="hidden" @change="upload" :disabled="uploading" />
        <Button as="span" :disabled="uploading">
          <ImagePlus class="w-4 h-4 mr-2" />
          {{ uploading ? 'Загружаю...' : 'Добавить' }}
        </Button>
      </label>
    </div>

    <!-- Album filter -->
    <div v-if="albums.length" class="flex gap-2 overflow-x-auto pb-1">
      <button
        :class="['px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex-shrink-0',
          activeAlbum === null ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent']"
        @click="activeAlbum = null">
        Все <span class="ml-1 opacity-60">{{ photos.length }}</span>
      </button>
      <button v-for="a in albums" :key="a.id"
        :class="['px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex-shrink-0',
          activeAlbum === a.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent']"
        @click="activeAlbum = a.id">
        {{ a.name }} <span class="ml-1 opacity-60">{{ a.count }}</span>
      </button>
    </div>

    <!-- Empty -->
    <div v-if="filtered.length === 0" class="text-center py-16">
      <ImagePlus class="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
      <p class="text-muted-foreground">Нет фотографий</p>
      <p class="text-sm text-muted-foreground mt-1">Нажмите «Добавить» чтобы загрузить</p>
    </div>

    <!-- Grid grouped by date -->
    <div v-for="[day, dayPhotos] in grouped" :key="day" class="space-y-2">
      <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">{{ formatDay(day) }}</p>
      <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
        <div v-for="photo in dayPhotos" :key="photo.id"
          class="relative aspect-square rounded-md overflow-hidden bg-muted cursor-pointer group">
          <img :src="photo.url" :alt="albumName(photo.albumId)"
            class="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            @click="openLightbox(photo)" />
          <button
            class="absolute top-1 right-1 p-1 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            @click.stop="deletePhoto(photo)">
            <Trash2 class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Lightbox -->
  <Transition name="fade">
    <div v-if="lightbox"
      class="fixed inset-0 z-[999] bg-black/95 flex items-center justify-center"
      @touchstart="onTouchStart" @touchend="onTouchEnd">

      <!-- Close -->
      <button class="absolute top-4 right-4 text-white/70 hover:text-white p-2 z-10" @click="lightbox = null">
        <X class="w-6 h-6" />
      </button>

      <!-- Delete -->
      <button class="absolute top-4 left-4 text-white/70 hover:text-red-400 p-2 z-10" @click="deletePhoto(lightbox!)">
        <Trash2 class="w-5 h-5" />
      </button>

      <!-- Prev -->
      <button v-if="lightbox && filtered.findIndex(p => p.id === lightbox!.id) > 0"
        class="absolute left-2 sm:left-4 text-white/70 hover:text-white p-2 z-10"
        @click="lightboxPrev">
        <ChevronLeft class="w-8 h-8" />
      </button>

      <!-- Image -->
      <img v-if="lightbox" :src="lightbox.url" class="max-w-full max-h-full object-contain select-none"
        style="max-height: 90vh; max-width: 90vw" />

      <!-- Next -->
      <button v-if="lightbox && filtered.findIndex(p => p.id === lightbox!.id) < filtered.length - 1"
        class="absolute right-2 sm:right-4 text-white/70 hover:text-white p-2 z-10"
        @click="lightboxNext">
        <ChevronRight class="w-8 h-8" />
      </button>

      <!-- Caption -->
      <div v-if="lightbox" class="absolute bottom-4 left-0 right-0 text-center">
        <span class="text-white/50 text-sm">{{ albumName(lightbox.albumId) }} · {{ new Date(lightbox.createdAt).toLocaleDateString('ru') }}</span>
        <span class="text-white/30 text-sm ml-3">{{ filtered.findIndex(p => p.id === lightbox!.id) + 1 }} / {{ filtered.length }}</span>
      </div>
    </div>
  </Transition>

  <!-- Delete conflict modal -->
  <div v-if="conflict" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="bg-card rounded-xl p-6 w-full max-w-sm space-y-4 border">
      <h2 class="font-semibold text-lg">Фото используется в дневнике</h2>
      <p class="text-sm text-muted-foreground">{{ conflict.message }}:</p>
      <ul class="space-y-1">
        <li v-for="e in conflict.usedIn" :key="e.id" class="text-sm font-medium truncate">• {{ e.title }}</li>
      </ul>
      <p class="text-sm text-muted-foreground">После удаления фото перестанет отображаться в этих записях.</p>
      <div class="flex gap-2">
        <Button variant="outline" class="flex-1" @click="conflict = null">Отмена</Button>
        <Button class="flex-1 bg-destructive hover:bg-destructive/90"
          @click="deletePhoto(photos.find(p => p.id === conflict!.photoId)!, true)">
          Всё равно удалить
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
