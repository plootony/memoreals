<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import api from '@/api'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import { Plus, X, ChevronLeft, ChevronRight, ImagePlus, Trash2, FolderInput, Pencil, Images, Star } from 'lucide-vue-next'

interface Album { id: string; name: string; description: string; isSystem: boolean; count: number; coverUrl: string | null }
interface Photo { id: string; url: string; albumId: string; note: string; createdAt: string }
interface DeleteConflict { usedIn: { id: string; title: string }[]; message: string; photoId: string }

// ── State ─────────────────────────────────────────────────────────────────────
const albums = ref<Album[]>([])
const photos = ref<Photo[]>([])
const view = ref<'albums' | 'all'>('albums')
const openedAlbum = ref<Album | null>(null)
const lightbox = ref<Photo | null>(null)
const conflict = ref<DeleteConflict | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

// Album creation / editing
const showNewAlbum = ref(false)
const newAlbumName = ref('')
const editingAlbum = ref<Album | null>(null)
const editAlbumName = ref('')
const editAlbumDesc = ref('')

// Upload
const pendingFiles = ref<File[]>([])
const uploadAlbumId = ref<string | null>(null)
const uploadNote = ref('')
const showUploadPicker = ref(false)
const uploading = ref(false)

// Context menu
const ctxMenu = ref<{ x: number; y: number; photo: Photo; showMove: boolean } | null>(null)
let longPressTimer: ReturnType<typeof setTimeout> | null = null

// ── Data ──────────────────────────────────────────────────────────────────────
async function load() {
  const r = await api.get('/gallery')
  albums.value = r.data.albums
  photos.value = r.data.photos
  // Refresh opened album data
  if (openedAlbum.value) {
    openedAlbum.value = r.data.albums.find((a: Album) => a.id === openedAlbum.value!.id) || null
  }
}

// ── Albums ────────────────────────────────────────────────────────────────────
async function createAlbum() {
  if (!newAlbumName.value.trim()) return
  const r = await api.post('/gallery/albums', { name: newAlbumName.value.trim() })
  albums.value.push(r.data)
  newAlbumName.value = ''
  showNewAlbum.value = false
}

function openAlbum(a: Album) { openedAlbum.value = a }
function closeAlbum() { openedAlbum.value = null }

function startEditAlbum(a: Album) {
  editingAlbum.value = a
  editAlbumName.value = a.name
  editAlbumDesc.value = a.description
}

async function saveAlbum() {
  if (!editingAlbum.value) return
  const payload: Record<string, string> = { description: editAlbumDesc.value }
  if (!editingAlbum.value.isSystem) payload.name = editAlbumName.value.trim() || editingAlbum.value.name
  await api.patch(`/gallery/albums/${editingAlbum.value.id}`, payload)
  await load()
  editingAlbum.value = null
}

async function deleteAlbum(a: Album) {
  await api.delete(`/gallery/albums/${a.id}`)
  if (openedAlbum.value?.id === a.id) openedAlbum.value = null
  editingAlbum.value = null
  await load()
}

async function setCover(photo: Photo) {
  await api.patch(`/gallery/albums/${photo.albumId}`, { cover_photo_id: photo.id })
  await load()
  ctxMenu.value = null
}

// ── Upload ────────────────────────────────────────────────────────────────────
function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) { input.value = ''; return }
  pendingFiles.value = files
  input.value = '' // clear after saving references
  uploadNote.value = ''
  uploadAlbumId.value = openedAlbum.value?.id
    ?? albums.value.find(a => !a.isSystem)?.id
    ?? albums.value[0]?.id
    ?? null
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
      if (uploadNote.value.trim()) form.append('note', uploadNote.value.trim())
      await api.post('/gallery', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    }
    await load()
  } finally {
    uploading.value = false
    pendingFiles.value = []
    uploadNote.value = ''
  }
}

// ── Delete photo ──────────────────────────────────────────────────────────────
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

// ── Move photo ────────────────────────────────────────────────────────────────
async function movePhoto(photo: Photo, albumId: string) {
  await api.patch(`/gallery/${photo.id}`, { albumId })
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
function onPhotoTouchEnd() { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null } }
function onPhotoTouchMove() { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null } }
function closeCtxMenu() { ctxMenu.value = null }

// ── Lightbox ──────────────────────────────────────────────────────────────────
const displayedPhotos = computed(() => {
  if (openedAlbum.value) return photos.value.filter(p => p.albumId === openedAlbum.value!.id)
  if (view.value === 'all') return photos.value
  return []
})

const grouped = computed(() => {
  const groups: Record<string, Photo[]> = {}
  for (const p of displayedPhotos.value) {
    const day = p.createdAt.slice(0, 10)
    if (!groups[day]) groups[day] = []
    groups[day].push(p)
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
})

function formatDay(d: string) { return new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' }) }
function albumName(id: string) { return albums.value.find(a => a.id === id)?.name ?? '' }

function lightboxNext() {
  const idx = displayedPhotos.value.findIndex(p => p.id === lightbox.value?.id)
  if (idx < displayedPhotos.value.length - 1) lightbox.value = displayedPhotos.value[idx + 1]
}
function lightboxPrev() {
  const idx = displayedPhotos.value.findIndex(p => p.id === lightbox.value?.id)
  if (idx > 0) lightbox.value = displayedPhotos.value[idx - 1]
}

let touchStartX = 0
function onLbTouchStart(e: TouchEvent) { touchStartX = e.touches[0].clientX }
function onLbTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchStartX
  if (Math.abs(dx) > 50) dx > 0 ? lightboxPrev() : lightboxNext()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { lightbox.value = null; closeCtxMenu() }
  if (!lightbox.value) return
  if (e.key === 'ArrowRight') lightboxNext()
  if (e.key === 'ArrowLeft') lightboxPrev()
}

onMounted(() => { load(); window.addEventListener('keydown', onKey) })
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="space-y-4" @click="closeCtxMenu">

    <!-- ── ALBUM DETAIL VIEW ── -->
    <template v-if="openedAlbum">
      <div class="flex items-center gap-3">
        <button @click="closeAlbum" class="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
          <ChevronLeft class="w-5 h-5" />
        </button>
        <div class="flex-1 min-w-0">
          <h1 class="text-2xl font-bold truncate">{{ openedAlbum.name }}</h1>
          <p v-if="openedAlbum.description" class="text-sm text-muted-foreground">{{ openedAlbum.description }}</p>
        </div>
        <button v-if="!openedAlbum.isSystem" class="p-1.5 rounded-lg hover:bg-accent text-muted-foreground" @click.stop="startEditAlbum(openedAlbum!)">
          <Pencil class="w-4 h-4" />
        </button>
        <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="onFilesSelected" />
        <Button @click="fileInput?.click()" :disabled="uploading">
          <ImagePlus class="w-4 h-4 mr-2" />Добавить
        </Button>
      </div>

      <!-- Photos in album -->
      <div v-if="displayedPhotos.length === 0" class="text-center py-16">
        <ImagePlus class="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
        <p class="text-muted-foreground">Альбом пуст</p>
      </div>
      <div v-for="[day, dayPhotos] in grouped" :key="day" class="space-y-2">
        <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">{{ formatDay(day) }}</p>
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
          <div v-for="photo in dayPhotos" :key="photo.id"
            class="relative aspect-square rounded-md overflow-hidden bg-muted cursor-pointer select-none group"
            @click.stop="lightbox = photo"
            @contextmenu.prevent="onPhotoContextMenu($event, photo)"
            @touchstart.passive="onPhotoTouchStart($event, photo)"
            @touchend.passive="onPhotoTouchEnd"
            @touchmove.passive="onPhotoTouchMove">
            <img :src="photo.url" class="w-full h-full object-cover" loading="lazy" />
            <div v-if="photo.note" class="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <p class="text-white text-xs truncate">{{ photo.note }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── MAIN VIEW ── -->
    <template v-else>
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

      <!-- View toggle -->
      <div class="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button :class="['px-3 py-1.5 rounded-md text-sm font-medium transition-colors', view === 'albums' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground']"
          @click.stop="view = 'albums'">
          Альбомы
        </button>
        <button :class="['px-3 py-1.5 rounded-md text-sm font-medium transition-colors', view === 'all' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground']"
          @click.stop="view = 'all'">
          Все фото
        </button>
      </div>

      <!-- Albums grid -->
      <div v-if="view === 'albums'">
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          <!-- Album cards -->
          <div v-for="a in albums" :key="a.id"
            class="group cursor-pointer"
            @click.stop="openAlbum(a)">
            <!-- Cover -->
            <div class="aspect-square rounded-xl overflow-hidden bg-muted mb-2 relative">
              <img v-if="a.coverUrl" :src="a.coverUrl" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
              <div v-else class="w-full h-full flex items-center justify-center">
                <Images class="w-10 h-10 text-muted-foreground opacity-40" />
              </div>
              <!-- Edit btn -->
              <button v-if="!a.isSystem"
                class="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                @click.stop="startEditAlbum(a)">
                <Pencil class="w-3.5 h-3.5" />
              </button>
            </div>
            <p class="text-sm font-semibold truncate">{{ a.name }}</p>
            <p v-if="a.description" class="text-xs text-muted-foreground truncate">{{ a.description }}</p>
            <p class="text-xs text-muted-foreground">{{ a.count }} фото</p>
          </div>

          <!-- New album card -->
          <div v-if="!showNewAlbum"
            class="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary hover:text-primary text-muted-foreground transition-colors"
            @click.stop="showNewAlbum = true">
            <Plus class="w-8 h-8" />
            <span class="text-sm font-medium">Новый альбом</span>
          </div>
          <div v-else class="rounded-xl border-2 border-primary p-4 flex flex-col gap-2" @click.stop>
            <input v-model="newAlbumName" placeholder="Название альбома" autofocus
              class="h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary w-full"
              @keyup.enter="createAlbum" @keyup.escape="showNewAlbum = false; newAlbumName = ''" />
            <div class="flex gap-1.5">
              <Button size="sm" class="flex-1" @click="createAlbum" :disabled="!newAlbumName.trim()">Создать</Button>
              <Button size="sm" variant="outline" @click="showNewAlbum = false; newAlbumName = ''"><X class="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        </div>
      </div>

      <!-- All photos flat grid -->
      <div v-else>
        <div v-if="photos.length === 0" class="text-center py-16">
          <ImagePlus class="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p class="text-muted-foreground">Нет фотографий</p>
        </div>
        <div v-for="[day, dayPhotos] in grouped" :key="day" class="space-y-2 mb-4">
          <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">{{ formatDay(day) }}</p>
          <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
            <div v-for="photo in dayPhotos" :key="photo.id"
              class="relative aspect-square rounded-md overflow-hidden bg-muted cursor-pointer select-none group"
              @click.stop="lightbox = photo"
              @contextmenu.prevent="onPhotoContextMenu($event, photo)"
              @touchstart.passive="onPhotoTouchStart($event, photo)"
              @touchend.passive="onPhotoTouchEnd"
              @touchmove.passive="onPhotoTouchMove">
              <img :src="photo.url" class="w-full h-full object-cover" loading="lazy" />
              <div v-if="photo.note" class="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <p class="text-white text-xs truncate">{{ photo.note }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- Context menu -->
  <Transition name="fade">
    <div v-if="ctxMenu" class="fixed z-[998] min-w-48 bg-card border rounded-xl shadow-xl overflow-hidden"
      :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }" @click.stop>
      <div v-if="ctxMenu.showMove" class="py-1">
        <p class="px-3 py-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">Перенести в</p>
        <button v-for="a in albums.filter(a => a.id !== ctxMenu!.photo.albumId)" :key="a.id"
          class="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
          @click="movePhoto(ctxMenu!.photo, a.id)">{{ a.name }}</button>
        <div class="border-t mx-2 my-1" />
        <button class="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-accent flex items-center gap-2"
          @click="ctxMenu!.showMove = false"><ChevronLeft class="w-3.5 h-3.5" />Назад</button>
      </div>
      <div v-else class="py-1">
        <button class="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
          @click="setCover(ctxMenu!.photo)">
          <Star class="w-4 h-4 text-muted-foreground" />Сделать обложкой
        </button>
        <button class="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
          @click="ctxMenu!.showMove = true">
          <FolderInput class="w-4 h-4 text-muted-foreground" />Перенести в альбом
        </button>
        <div class="border-t mx-2 my-1" />
        <button class="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-accent flex items-center gap-2"
          @click="deletePhoto(ctxMenu!.photo)">
          <Trash2 class="w-4 h-4" />Удалить
        </button>
      </div>
    </div>
  </Transition>

  <!-- Lightbox -->
  <Transition name="fade">
    <div v-if="lightbox" class="fixed inset-0 z-[999] bg-black/95 flex items-center justify-center"
      @touchstart.passive="onLbTouchStart" @touchend.passive="onLbTouchEnd">
      <button class="absolute top-4 right-4 text-white/70 hover:text-white p-2 z-10" @click="lightbox = null"><X class="w-6 h-6" /></button>
      <button v-if="lightbox && displayedPhotos.findIndex(p => p.id === lightbox!.id) > 0"
        class="absolute left-2 sm:left-4 text-white/70 hover:text-white p-2 z-10" @click="lightboxPrev"><ChevronLeft class="w-8 h-8" /></button>
      <div class="flex flex-col items-center gap-3">
        <img v-if="lightbox" :src="lightbox.url" class="object-contain select-none" style="max-height:85vh;max-width:90vw" />
        <p v-if="lightbox?.note" class="text-white/80 text-sm text-center max-w-md px-4">{{ lightbox.note }}</p>
      </div>
      <button v-if="lightbox && displayedPhotos.findIndex(p => p.id === lightbox!.id) < displayedPhotos.length - 1"
        class="absolute right-2 sm:right-4 text-white/70 hover:text-white p-2 z-10" @click="lightboxNext"><ChevronRight class="w-8 h-8" /></button>
      <div v-if="lightbox" class="absolute bottom-4 left-0 right-0 text-center">
        <span class="text-white/40 text-xs">{{ albumName(lightbox.albumId) }} · {{ new Date(lightbox.createdAt).toLocaleDateString('ru') }}</span>
        <span class="text-white/30 text-xs ml-3">{{ displayedPhotos.findIndex(p => p.id === lightbox!.id) + 1 }} / {{ displayedPhotos.length }}</span>
      </div>
    </div>
  </Transition>

  <!-- Upload picker -->
  <div v-if="showUploadPicker" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
    <div class="bg-card w-full sm:max-w-sm rounded-t-xl sm:rounded-xl p-5 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold">Загрузить фото</h2>
        <span class="text-xs text-muted-foreground">{{ pendingFiles.length }} фото</span>
      </div>

      <!-- Note -->
      <div class="space-y-1.5">
        <Label class="text-xs">Описание (необязательно)</Label>
        <Input v-model="uploadNote" placeholder="Гоняли в картинг, было круто" class="h-9" />
      </div>

      <!-- Album -->
      <div class="space-y-1.5">
        <Label class="text-xs">Альбом</Label>
        <div class="space-y-1 max-h-48 overflow-y-auto">
          <button v-for="a in albums" :key="a.id"
            class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between"
            :class="uploadAlbumId === a.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'"
            @click="uploadAlbumId = a.id">
            {{ a.name }}
            <span v-if="uploadAlbumId === a.id" class="text-primary text-base">✓</span>
          </button>
          <p v-if="albums.length === 0" class="text-sm text-muted-foreground px-3 py-2">Нет альбомов</p>
        </div>
      </div>

      <div class="flex gap-2 pt-1">
        <Button variant="outline" class="flex-1" @click="showUploadPicker = false; pendingFiles = []">Отмена</Button>
        <Button class="flex-1" @click="confirmUpload">Загрузить</Button>
      </div>
    </div>
  </div>

  <!-- Edit album modal -->
  <div v-if="editingAlbum" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="bg-card rounded-xl p-5 w-full max-w-sm space-y-4 border">
      <h2 class="font-semibold">Редактировать альбом</h2>
      <div class="space-y-3">
        <div v-if="!editingAlbum.isSystem" class="space-y-1.5">
          <Label class="text-xs">Название</Label>
          <Input v-model="editAlbumName" @keyup.enter="saveAlbum" autofocus />
        </div>
        <div class="space-y-1.5">
          <Label class="text-xs">Описание</Label>
          <Input v-model="editAlbumDesc" placeholder="Необязательно" />
        </div>
      </div>
      <div class="flex gap-2">
        <Button v-if="!editingAlbum.isSystem" variant="outline" size="sm" class="text-destructive hover:text-destructive"
          @click="deleteAlbum(editingAlbum!)">
          <Trash2 class="w-3.5 h-3.5 mr-1.5" />Удалить
        </Button>
        <div class="flex-1" />
        <Button variant="outline" @click="editingAlbum = null">Отмена</Button>
        <Button @click="saveAlbum">Сохранить</Button>
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
        <Button class="flex-1 bg-destructive hover:bg-destructive/90"
          @click="deletePhoto(photos.find(p => p.id === conflict!.photoId)!, true)">Всё равно удалить</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
