<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '@/stores/player'
import api from '@/api'
import { uploadImage } from '@/lib/uploadImage'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat,
  Volume2, VolumeX, Upload, Trash2, Music, Plus, ListPlus,
  Pencil, Check, X, ImagePlus, ListX, Loader2, Youtube
} from 'lucide-vue-next'

const player = usePlayerStore()

// Playlist management
const showNewPlaylist = ref(false)
const newPlaylistName = ref('')
const editingPlaylistId = ref<string | null>(null)
const editingPlaylistName = ref('')

// Track cover / edit
const editingTrackId = ref<string | null>(null)
const coverInputRef = ref<HTMLInputElement | null>(null)

// Upload
const uploading = ref(false)
const coverUploading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

// YouTube converter
const ytUrl = ref('')
const ytLoading = ref(false)
const ytError = ref('')
const ytSuccess = ref('')
const ytStatus = ref('')

async function downloadFromYoutube() {
  if (!ytUrl.value.trim()) return
  ytError.value = ''
  ytSuccess.value = ''
  ytStatus.value = ''
  ytLoading.value = true
  const url = ytUrl.value.trim()
  ytUrl.value = ''

  try {
    // Start job
    const { data } = await api.post('/music/youtube', { url })
    const jobId = data.jobId
    ytStatus.value = 'Скачивание...'

    // Poll for result
    const poll = async () => {
      try {
        const { data: job } = await api.get(`/music/youtube/${jobId}`)
        if (job.status === 'done') {
          ytLoading.value = false
          ytStatus.value = ''
          ytSuccess.value = `✓ "${job.track.title}" добавлен`
          await player.load()
          setTimeout(() => ytSuccess.value = '', 5000)
        } else if (job.status === 'error') {
          ytLoading.value = false
          ytStatus.value = ''
          ytError.value = job.error
        } else {
          setTimeout(poll, 3000)
        }
      } catch {
        ytLoading.value = false
        ytStatus.value = ''
        ytError.value = 'Ошибка при проверке статуса'
      }
    }
    setTimeout(poll, 3000)
  } catch (e: any) {
    ytLoading.value = false
    ytError.value = e.response?.data?.error || 'Ошибка запуска загрузки'
  }
}

// Playlist dropdown
const playlistMenuTrackId = ref<string | null>(null)

function formatTime(s: number) {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function onSeek(e: Event) {
  player.seek(Number((e.target as HTMLInputElement).value))
}

function toggleMute() {
  player.setVolume(player.volume > 0 ? 0 : 1)
}

function togglePlaylistMenu(trackId: string) {
  playlistMenuTrackId.value = playlistMenuTrackId.value === trackId ? null : trackId
}

function closePlaylistMenu() { playlistMenuTrackId.value = null }

// Upload MP3
async function uploadFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('title', file.name.replace(/\.mp3$/i, ''))
    const { useAuthStore } = await import('@/stores/auth')
    const store = useAuthStore()
    await api.post('/music/tracks', form, {
      headers: { 'Content-Type': 'multipart/form-data', codeword: store.codeword! }
    })
    await player.load()
  } finally {
    uploading.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

// Cover image
function pickCover(trackId: string) {
  editingTrackId.value = trackId
  coverInputRef.value?.click()
}

async function onCoverSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !editingTrackId.value) return
  coverUploading.value = true
  try {
    const url = await uploadImage(file, 'cover')
    await player.updateTrack(editingTrackId.value!, { cover: url })
    editingTrackId.value = null
  } finally {
    coverUploading.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

async function removeCover(trackId: string) {
  await player.updateTrack(trackId, { cover: '' })
}

// Playlist crud
async function createPlaylist() {
  if (!newPlaylistName.value.trim()) return
  await api.post('/music/playlists', { name: newPlaylistName.value, trackIds: [] })
  showNewPlaylist.value = false
  newPlaylistName.value = ''
  await player.load()
}

function startRenamePlaylist(id: string, name: string) {
  editingPlaylistId.value = id
  editingPlaylistName.value = name
}

async function confirmRenamePlaylist() {
  if (!editingPlaylistId.value || !editingPlaylistName.value.trim()) return
  await player.renamePlaylist(editingPlaylistId.value, editingPlaylistName.value.trim())
  editingPlaylistId.value = null
}

onMounted(() => {
  player.load()
  document.addEventListener('click', closePlaylistMenu)
})
onUnmounted(() => document.removeEventListener('click', closePlaylistMenu))
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <h1 class="text-2xl font-bold">Плеер</h1>
      <div class="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" @click="showNewPlaylist = true"><Plus class="w-4 h-4 mr-1.5" />Плейлист</Button>
        <Button size="sm" :disabled="uploading" @click="fileInputRef?.click()">
          <Upload class="w-4 h-4 mr-1.5" />{{ uploading ? 'Загрузка...' : 'Добавить MP3' }}
        </Button>
        <input ref="fileInputRef" type="file" accept=".mp3,audio/mpeg" class="hidden" @change="uploadFile" />
        <input ref="coverInputRef" type="file" accept="image/*" class="hidden" @change="onCoverSelected" />
      </div>
    </div>

    <!-- YouTube converter -->
    <Card class="p-4 space-y-3">
      <div class="flex items-center gap-2">
        <Youtube class="w-4 h-4 text-red-500 flex-shrink-0" />
        <span class="text-sm font-semibold">YouTube → MP3</span>
      </div>
      <div class="flex gap-2">
        <Input
          v-model="ytUrl"
          placeholder="https://youtube.com/watch?v=..."
          class="flex-1 text-sm"
          @keyup.enter="downloadFromYoutube"
          :disabled="ytLoading"
        />
        <Button @click="downloadFromYoutube" :disabled="ytLoading || !ytUrl.trim()" size="sm">
          <Loader2 v-if="ytLoading" class="w-4 h-4 animate-spin" />
          <span v-else>Скачать</span>
        </Button>
      </div>
      <div v-if="ytLoading" class="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 class="w-3 h-3 animate-spin flex-shrink-0" />
        {{ ytStatus || 'Загрузка...' }} — это займёт 1–2 минуты
      </div>
      <p v-if="ytError" class="text-xs text-destructive">{{ ytError }}</p>
      <p v-if="ytSuccess" class="text-xs text-green-500">{{ ytSuccess }}</p>
    </Card>

    <!-- Two-column layout: player left, tracks right -->
    <div class="flex flex-col lg:flex-row gap-4 items-start">

      <!-- Left: Player card -->
      <Card v-if="player.tracks.length > 0" class="p-4 space-y-3 w-full lg:w-72 flex-shrink-0 lg:sticky lg:top-4">
        <!-- Cover — full-width square -->
        <div class="w-full aspect-square rounded-lg overflow-hidden bg-muted flex items-center justify-center">
          <img v-if="player.currentTrack?.cover" :src="player.currentTrack.cover" class="w-full h-full object-cover" />
          <Music v-else class="w-20 h-20 text-muted-foreground opacity-30" />
        </div>

        <div class="text-center">
          <p class="font-semibold truncate">{{ player.currentTrack?.title || 'Нет трека' }}</p>
          <p class="text-sm text-muted-foreground truncate">{{ player.currentTrack?.artist || '—' }}</p>
        </div>

        <!-- Progress -->
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span class="w-8 text-right flex-shrink-0">{{ formatTime(player.progress) }}</span>
          <input type="range" :max="player.duration || 100" :value="player.progress" @input="onSeek" class="flex-1 h-1 accent-primary min-w-0" />
          <span class="w-8 flex-shrink-0">{{ formatTime(player.duration) }}</span>
        </div>

        <!-- Volume -->
        <div class="flex items-center gap-2">
          <button @click="toggleMute()" class="text-muted-foreground hover:text-foreground flex-shrink-0">
            <VolumeX v-if="player.volume === 0" class="w-4 h-4" />
            <Volume2 v-else class="w-4 h-4" />
          </button>
          <input type="range" min="0" max="1" step="0.01" :value="player.volume"
            @input="player.setVolume(Number(($event.target as HTMLInputElement).value))"
            class="flex-1 h-1 accent-primary" />
        </div>

        <!-- Controls -->
        <div class="flex items-center justify-center gap-3">
          <button @click="player.shuffle = !player.shuffle" :class="['p-2 rounded', player.shuffle ? 'text-primary' : 'text-muted-foreground hover:text-foreground']"><Shuffle class="w-4 h-4" /></button>
          <button @click="player.prev()" class="p-2 rounded hover:bg-accent"><SkipBack class="w-5 h-5" /></button>
          <button @click="player.togglePlay()" class="p-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
            <Play v-if="!player.isPlaying" class="w-5 h-5" /><Pause v-else class="w-5 h-5" />
          </button>
          <button @click="player.next()" class="p-2 rounded hover:bg-accent"><SkipForward class="w-5 h-5" /></button>
          <button @click="player.repeat = !player.repeat" :class="['p-2 rounded', player.repeat ? 'text-primary' : 'text-muted-foreground hover:text-foreground']"><Repeat class="w-4 h-4" /></button>
        </div>
      </Card>

      <!-- Right: Playlist tabs + Track list -->
      <div class="flex-1 min-w-0 space-y-2">

        <!-- Playlist tabs -->
        <div v-if="player.playlists.length || player.tracks.length" class="flex gap-2 flex-wrap items-center">
          <Button :variant="player.activePlaylist === null ? 'default' : 'outline'" size="sm"
            @click="player.activePlaylist = null">
            Все треки ({{ player.tracks.length }})
          </Button>

          <div v-for="pl in player.playlists" :key="pl.id" class="flex items-center gap-1">
            <template v-if="editingPlaylistId === pl.id">
              <Input v-model="editingPlaylistName" class="h-8 text-sm w-32"
                @keyup.enter="confirmRenamePlaylist" @keyup.escape="editingPlaylistId = null" />
              <button @click="confirmRenamePlaylist" class="p-1 text-primary hover:text-primary/80"><Check class="w-3.5 h-3.5" /></button>
              <button @click="editingPlaylistId = null" class="p-1 text-muted-foreground hover:text-foreground"><X class="w-3.5 h-3.5" /></button>
            </template>
            <template v-else>
              <Button :variant="player.activePlaylist?.id === pl.id ? 'default' : 'outline'" size="sm"
                @click="player.activePlaylist = pl">
                {{ pl.name }} ({{ pl.trackIds.length }})
              </Button>
              <button @click.stop="startRenamePlaylist(pl.id, pl.name)"
                class="p-1 text-muted-foreground hover:text-foreground"><Pencil class="w-3 h-3" /></button>
              <button @click.stop="player.deletePlaylist(pl.id)"
                class="p-1 text-muted-foreground hover:text-destructive"><Trash2 class="w-3 h-3" /></button>
            </template>
          </div>
        </div>

        <!-- Track list -->
        <div class="space-y-1" @click.self="closePlaylistMenu">
          <div v-for="(track, idx) in player.queue" :key="track.id"
            :class="['flex items-center gap-3 p-2 rounded-md transition-colors group', player.currentTrack?.id === track.id ? 'bg-primary/10' : 'hover:bg-accent']"
          >
            <div class="w-10 h-10 rounded overflow-hidden bg-muted flex items-center justify-center flex-shrink-0 cursor-pointer"
              @click="player.play(track, idx)">
              <img v-if="track.cover" :src="track.cover" class="w-full h-full object-cover" />
              <Music v-else class="w-4 h-4 text-muted-foreground" />
            </div>

            <div class="flex-1 min-w-0 cursor-pointer" @click="player.play(track, idx)">
              <p class="text-sm font-medium truncate" :class="{ 'text-primary': player.currentTrack?.id === track.id }">{{ track.title }}</p>
              <p class="text-xs text-muted-foreground truncate">{{ track.artist || '—' }}</p>
            </div>

            <Pause v-if="player.currentTrack?.id === track.id && player.isPlaying" class="w-4 h-4 text-primary flex-shrink-0" />

            <div class="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button class="p-1.5 rounded hover:bg-background text-muted-foreground hover:text-foreground" @click.stop="pickCover(track.id)" title="Обложка" :disabled="coverUploading">
                <Loader2 v-if="coverUploading && editingTrackId === track.id" class="w-3.5 h-3.5 animate-spin" />
                <ImagePlus v-else class="w-3.5 h-3.5" />
              </button>
              <button v-if="track.cover" class="p-1.5 rounded hover:bg-background text-muted-foreground hover:text-foreground" @click.stop="removeCover(track.id)" title="Убрать обложку">
                <X class="w-3.5 h-3.5" />
              </button>

              <div v-if="player.playlists.length" class="relative">
                <button class="p-1.5 rounded hover:bg-background text-muted-foreground hover:text-foreground" @click.stop="togglePlaylistMenu(track.id)" title="В плейлист">
                  <ListPlus class="w-3.5 h-3.5" />
                </button>
                <div v-if="playlistMenuTrackId === track.id"
                  class="absolute right-0 top-8 z-10 min-w-[180px] rounded-md border bg-card shadow-md py-1">
                  <p class="px-3 py-1 text-xs text-muted-foreground font-medium">Добавить в плейлист</p>
                  <button v-for="pl in player.playlists" :key="pl.id"
                    class="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center justify-between gap-2"
                    @click.stop="player.addToPlaylist(pl.id, track.id); closePlaylistMenu()">
                    <span class="truncate">{{ pl.name }}</span>
                    <span v-if="pl.trackIds.includes(track.id)" class="text-xs text-primary flex-shrink-0">✓</span>
                  </button>
                </div>
              </div>

              <button v-if="player.activePlaylist"
                class="p-1.5 rounded hover:bg-background text-muted-foreground hover:text-destructive"
                @click.stop="player.removeFromPlaylist(player.activePlaylist!.id, track.id)"
                title="Убрать из плейлиста">
                <ListX class="w-3.5 h-3.5" />
              </button>

              <button class="p-1.5 rounded hover:bg-background text-muted-foreground hover:text-destructive"
                @click.stop="player.deleteTrack(track.id)" title="Удалить трек">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <p v-if="player.queue.length === 0" class="text-sm text-muted-foreground text-center py-8">
            {{ player.activePlaylist ? 'Плейлист пуст. Добавьте треки через кнопку ⊕.' : 'Нет треков. Загрузите MP3.' }}
          </p>
        </div>

      </div>
    </div>

    <!-- New playlist modal -->
    <div v-if="showNewPlaylist" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card class="w-full max-w-sm p-6 space-y-4">
        <h2 class="font-semibold text-lg">Новый плейлист</h2>
        <Input v-model="newPlaylistName" placeholder="Название плейлиста" @keyup.enter="createPlaylist" />
        <div class="flex gap-2">
          <Button variant="outline" class="flex-1" @click="showNewPlaylist = false">Отмена</Button>
          <Button class="flex-1" @click="createPlaylist" :disabled="!newPlaylistName.trim()">Создать</Button>
        </div>
      </Card>
    </div>
  </div>
</template>
