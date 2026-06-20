<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import api from '@/api'
import Button from '@/components/ui/Button.vue'
import { Plus, X, ChevronLeft, ChevronRight, ImagePlus, Trash2, FolderInput } from 'lucide-vue-next'

interface Album { id: string; name: string; isSystem: boolean; count: number }
interface Photo { id: string; url: string; albumId: string; note: string; createdAt: string }
interface DeleteConflict { usedIn: { id: string; title: string }[]; message: string; photoId: string }

// ── State ─────────────────────────────────────────────────────────────────────
const albums = ref<Album[]>([])
const photos = ref<Photo[]>([])
const activeAlbum = ref<string | null>(null)
const lightbox = ref<Photo | null>(null)
const conflict = ref<DeleteConflict | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

// Album creation
const newAlbumName = ref('')
const showNewAlbum = ref(false)

// Upload album picker
const pendingFiles = ref<File[]>([])
const uploadAlbumId = ref<string | null>(null)
const showUploadPicker = ref(false)
const uploading = ref(false)

// Context menu
const ctxMenu = ref<{ x: number; y: number; photo: Photo; showMove: boolean } | null>(null)
let longPressTimer: ReturnType<typeof setTimeout> | null = null

// ── Load ──────────────────────────────────────────────────────────────────────
async function load() {
  const r = await api.get('/gallery')
  albums.value = r.data.albums
  photos.value = r.data.photos
}

// ── Albums ────────────────────────────────────────────────────────────────────
async function createAlbum() {
  if (!newAlbumName.value.trim()) return
  const r = await api.post('/gallery/albums', { name: newAlbumName.value.trim() })
  albums.value.push(r.data)
  activeAlbum.value = r.data.id
  newAlbumName.value = ''
  showNewAlbum.value = false
}

// ── Upload ────────────────────────────────────────────────────────────────────
function onFilesSelected(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files || []);
  (e.target as HTMLInputElement).value = ''
  if (!files.length) return
  pendingFiles.value = files
  uploadAlbumId.value = activeAlbum.value
  showUploadPicker.value = true
}

async function confirmUpload() {
  uploading.value = true
  showUploadPicker.value = false
  try {
    for (const file of pendingFiles.value) {
      const form = new FormData()
      form.append('image', file)
      if (uploadAlbumId.value) form.append('albumId', uploadAlbumId.value)
      await api.post('/gallery', form)
    }
    await load()
  } finally {
    uploading.value = false
    pendingFiles.value = []
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function deletePhoto(photo: Photo, force = false) {
  try {
    await api.delete(`/gallery/${photo.id}${force ? '?force=true' : ''}`)
    photos.value = photos.value.filter(p => p.id !== photo.id)
    if (lightbox.value?.id === photo.id) lightbox.value = null
    conflict.value = null
    ctxMenu.value = null
  } catch (e: any) {
    ctxMenu.value = null
    if (e.response?.status === 409) conflict.value = { ...e.response.data, photoId: photo.id }
  }
}

// ── Move ──────────────────────────────────────────────────────────────────────
async function movePhoto(photo: Photo, albumId: string) {
  await api.patch(`/gallery/${photo.id}`, { albumId })
  const p = photos.value.find(p => p.id === photo.id)
  if (p) p.albumId = albumId
  ctxMenu.value = null
  await load()
}

// ── Context menu ──────────────────────────────────────────────────────────────
function openCtxMenu(x: number, y: number, photo: Photo) {
  ctxMenu.value = { x, y, photo, showMove: false }
}

function onPhotoContextMenu(e: MouseEvent, photo: Photo) {
  if (lightbox.value) return
  e.preventDefault()
  openCtxMenu(e.clientX, e.clientY, photo)
}

function onPhotoTouchStart(e: TouchEvent, photo: Photo) {
  const t = e.touches[0]
  longPressTimer = setTimeout(() => openCtxMenu(t.clientX, t.clientY, photo), 500)
}
function onPhotoTouchEnd() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
}
function onPhotoTouchMove() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
}

function closeCtxMenu() { ctxMenu.value = null }

// ── Lightbox ──────────────────────────────────────────────────────────────────
const filtered = computed(() => activeAlbum.value ? photos.value.filter(p => p.albumId === activeAlbum.value) : photos.value)

const grouped = computed(() => {
  const groups: Record<string, Photo[]> = {}
  for (const p of filtered.value) {
    const day = p.createdAt.slice(0, 10)
    if (!groups[day]) groups[day] = []
    groups[day].push(p)
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
})

function formatDay(d: string) { return new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' }) }
function albumName(id: string) { return albums.value.find(a => a.id === id)?.name ?? '' }

function lightboxNext() {
  const idx = filtered.value.findIndex(p => p.id === lightbox.value?.id)
  if (idx < filtered.value.length - 1) lightbox.value = filtered.value[idx + 1]
}
function lightboxPrev() {
  const idx = filtered.value.findIndex(p => p.id === lightbox.value?.id)
  if (idx > 0) lightbox.value = filtered.value[idx - 1]
}

let touchStartX = 0
function onLightboxTouchStart(e: TouchEvent) { touchStartX = e.touches[0].clientX }
function onLightboxTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchStartX
  if (Math.abs(dx) > 50) dx > 0 ? lightboxPrev() : lightboxNext()
}

function onKey(e: KeyboardEvent) {
  if (!lightbox.value) return
  if (e.key === 'ArrowRight') lightboxNext()
  if (e.key === 'ArrowLeft') lightboxPrev()
  if (e.key === 'Escape') { lightbox.value = null; closeCtxMenu() }
}

onMounted(() => { load(); window.addEventListener('keydown', onKey) })
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="space-y-4" @click="closeCtxMenu">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Галерея</h1>
      <div class="flex items-center gap-2">
        <span v-if="uploading" class="text-sm text-muted-foreground">Загружаю...</span>
        <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="onFilesSelected" />
        <Button @click="fileInput?.click()" :disabled="uploading">
          <ImagePlus class="w-4 h-4 mr-2" />Добавить
        </Button>
      </div>
    </div>

    <!-- Album chips + create -->
    <div class="flex gap-2 overflow-x-auto pb-1 items-center">
      <button :class="['px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex-shrink-0', activeAlbum === null ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent']" @click.stop="activeAlbum = null">
        Все <span class="ml-1 opacity-60">{{ photos.length }}</span>
      </button>
      <button v-for="a in albums" :key="a.id"
        :class="['px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex-shrink-0', activeAlbum === a.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent']"
        @click.stop="activeAlbum = a.id">
        {{ a.name }} <span class="ml-1 opacity-60">{{ a.count }}</span>
      </button>
      <div v-if="showNewAlbum" class="flex items-center gap-1.5 flex-shrink-0" @click.stop>
        <input v-model="newAlbumName" placeholder="Название альбома"
          class="h-8 px-2.5 rounded-full border border-input bg-background text-sm w-40 focus:outline-none focus:ring-1 focus:ring-primary"
          autofocus @keyup.enter="createAlbum" @keyup.escape="showNewAlbum = false; newAlbumName = ''" />
        <button @click="createAlbum" class="p-1.5 rounded-full bg-primary text-primary-foreground"><Plus class="w-3.5 h-3.5" /></button>
        <button @click="showNewAlbum = false; newAlbumName = ''" class="p-1.5 rounded-full bg-muted hover:bg-accent"><X class="w-3.5 h-3.5" /></button>
      </div>
      <button v-else class="p-1.5 rounded-full bg-muted text-muted-foreground hover:bg-accent flex-shrink-0" title="Создать альбом" @click.stop="showNewAlbum = true">
        <Plus class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Empty -->
    <div v-if="filtered.length === 0" class="text-center py-16">
      <ImagePlus class="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
      <p class="text-muted-foreground">Нет фотографий</p>
      <p class="text-sm text-muted-foreground mt-1">Нажмите «Добавить» чтобы загрузить</p>
    </div>

    <!-- Grid -->
    <div v-for="[day, dayPhotos] in grouped" :key="day" class="space-y-2">
      <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">{{ formatDay(day) }}</p>
      <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
        <div v-for="photo in dayPhotos" :key="photo.id"
          class="relative aspect-square rounded-md overflow-hidden bg-muted cursor-pointer select-none"
          @click.stop="lightbox = photo"
          @contextmenu.prevent="onPhotoContextMenu($event, photo)"
          @touchstart.passive="onPhotoTouchStart($event, photo)"
          @touchend.passive="onPhotoTouchEnd"
          @touchmove.passive="onPhotoTouchMove">
          <img :src="photo.url" class="w-full h-full object-cover" loading="lazy" />
        </div>
      </div>
    </div>
  </div>

  <!-- Context menu -->
  <Transition name="fade">
    <div v-if="ctxMenu" class="fixed z-[998] min-w-44 bg-card border rounded-xl shadow-xl overflow-hidden"
      :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
      @click.stop>
      <!-- Move submenu -->
      <div v-if="ctxMenu.showMove" class="py-1">
        <p class="px-3 py-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">Перенести в</p>
        <button v-for="a in albums.filter(a => a.id !== ctxMenu!.photo.albumId)" :key="a.id"
          class="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
          @click="movePhoto(ctxMenu!.photo, a.id)">
          {{ a.name }}
        </button>
        <div class="border-t mx-2 my-1" />
        <button class="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors flex items-center gap-2"
          @click="ctxMenu!.showMove = false">
          <ChevronLeft class="w-3.5 h-3.5" />Назад
        </button>
      </div>
      <!-- Main menu -->
      <div v-else class="py-1">
        <button class="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
          @click="ctxMenu!.showMove = true">
          <FolderInput class="w-4 h-4 text-muted-foreground" />Перенести в альбом
        </button>
        <div class="border-t mx-2 my-1" />
        <button class="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-accent transition-colors flex items-center gap-2"
          @click="deletePhoto(ctxMenu!.photo)">
          <Trash2 class="w-4 h-4" />Удалить
        </button>
      </div>
    </div>
  </Transition>

  <!-- Lightbox -->
  <Transition name="fade">
    <div v-if="lightbox" class="fixed inset-0 z-[999] bg-black/95 flex items-center justify-center"
      @touchstart.passive="onLightboxTouchStart" @touchend.passive="onLightboxTouchEnd">
      <button class="absolute top-4 right-4 text-white/70 hover:text-white p-2 z-10" @click="lightbox = null"><X class="w-6 h-6" /></button>
      <button v-if="lightbox && filtered.findIndex(p => p.id === lightbox!.id) > 0" class="absolute left-2 sm:left-4 text-white/70 hover:text-white p-2 z-10" @click="lightboxPrev"><ChevronLeft class="w-8 h-8" /></button>
      <img v-if="lightbox" :src="lightbox.url" class="object-contain select-none" style="max-height:90vh;max-width:90vw" />
      <button v-if="lightbox && filtered.findIndex(p => p.id === lightbox!.id) < filtered.length - 1" class="absolute right-2 sm:right-4 text-white/70 hover:text-white p-2 z-10" @click="lightboxNext"><ChevronRight class="w-8 h-8" /></button>
      <div v-if="lightbox" class="absolute bottom-4 left-0 right-0 text-center">
        <span class="text-white/50 text-sm">{{ albumName(lightbox.albumId) }} · {{ new Date(lightbox.createdAt).toLocaleDateString('ru') }}</span>
        <span class="text-white/30 text-sm ml-3">{{ filtered.findIndex(p => p.id === lightbox!.id) + 1 }} / {{ filtered.length }}</span>
      </div>
    </div>
  </Transition>

  <!-- Upload album picker modal -->
  <div v-if="showUploadPicker" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
    <div class="bg-card w-full sm:max-w-sm rounded-t-xl sm:rounded-xl p-5 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold">В какой альбом?</h2>
        <span class="text-xs text-muted-foreground">{{ pendingFiles.length }} фото</span>
      </div>
      <div class="space-y-1">
        <button class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between"
          :class="uploadAlbumId === null ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'"
          @click="uploadAlbumId = null">
          Без категории
          <span v-if="uploadAlbumId === null" class="text-primary">✓</span>
        </button>
        <button v-for="a in albums" :key="a.id"
          class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between"
          :class="uploadAlbumId === a.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'"
          @click="uploadAlbumId = a.id">
          {{ a.name }}
          <span v-if="uploadAlbumId === a.id" class="text-primary">✓</span>
        </button>
      </div>
      <div class="flex gap-2 pt-1">
        <Button variant="outline" class="flex-1" @click="showUploadPicker = false; pendingFiles = []">Отмена</Button>
        <Button class="flex-1" @click="confirmUpload">Загрузить</Button>
      </div>
    </div>
  </div>

  <!-- Delete conflict modal -->
  <div v-if="conflict" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="bg-card rounded-xl p-6 w-full max-w-sm space-y-4 border">
      <h2 class="font-semibold text-lg">Фото используется в дневнике</h2>
      <p class="text-sm text-muted-foreground">{{ conflict.message }}:</p>
      <ul class="space-y-1"><li v-for="e in conflict.usedIn" :key="e.id" class="text-sm font-medium truncate">• {{ e.title }}</li></ul>
      <p class="text-sm text-muted-foreground">После удаления фото перестанет отображаться в этих записях.</p>
      <div class="flex gap-2">
        <Button variant="outline" class="flex-1" @click="conflict = null">Отмена</Button>
        <Button class="flex-1 bg-destructive hover:bg-destructive/90" @click="deletePhoto(photos.find(p => p.id === conflict!.photoId)!, true)">Всё равно удалить</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
