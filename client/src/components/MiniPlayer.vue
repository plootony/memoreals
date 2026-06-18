<script setup lang="ts">
import { usePlayerStore } from '@/stores/player'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Music } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

const player = usePlayerStore()
const router = useRouter()

function formatTime(s: number) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function onSeek(e: Event) {
  player.seek(Number((e.target as HTMLInputElement).value))
}

function toggleMute() {
  player.setVolume(player.volume > 0 ? 0 : 1)
}
</script>

<template>
  <div
    v-if="player.currentTrack"
    class="border-t bg-card px-4 py-2 flex items-center gap-3"
  >
    <!-- Cover -->
    <div class="w-9 h-9 rounded overflow-hidden bg-muted flex items-center justify-center flex-shrink-0 cursor-pointer"
      @click="router.push('/music')">
      <img v-if="player.currentTrack.cover" :src="player.currentTrack.cover" class="w-full h-full object-cover" />
      <Music v-else class="w-4 h-4 text-muted-foreground opacity-40" />
    </div>

    <!-- Track info -->
    <div class="flex-1 min-w-0 cursor-pointer" @click="router.push('/music')">
      <p class="text-sm font-medium truncate leading-tight">{{ player.currentTrack.title }}</p>
      <p class="text-xs text-muted-foreground truncate">{{ player.currentTrack.artist || '—' }}</p>
    </div>

    <!-- Controls -->
    <div class="flex items-center gap-1 flex-shrink-0">
      <button @click="player.prev()" class="p-1.5 rounded hover:bg-accent">
        <SkipBack class="w-4 h-4" />
      </button>
      <button
        @click="player.togglePlay()"
        class="p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <Play v-if="!player.isPlaying" class="w-4 h-4" />
        <Pause v-else class="w-4 h-4" />
      </button>
      <button @click="player.next()" class="p-1.5 rounded hover:bg-accent">
        <SkipForward class="w-4 h-4" />
      </button>
    </div>

    <!-- Progress -->
    <div class="hidden sm:flex items-center gap-2 w-48 flex-shrink-0">
      <span class="text-xs text-muted-foreground w-8 text-right">{{ formatTime(player.progress) }}</span>
      <input
        type="range"
        :max="player.duration || 100"
        :value="player.progress"
        @input="onSeek"
        class="flex-1 h-1 accent-primary"
      />
      <span class="text-xs text-muted-foreground w-8">{{ formatTime(player.duration) }}</span>
    </div>

    <!-- Volume -->
    <div class="hidden md:flex items-center gap-1.5 w-24 flex-shrink-0">
      <button @click="toggleMute()" class="p-1 hover:text-foreground text-muted-foreground">
        <VolumeX v-if="player.volume === 0" class="w-4 h-4" />
        <Volume2 v-else class="w-4 h-4" />
      </button>
      <input
        type="range" min="0" max="1" step="0.01"
        :value="player.volume"
        @input="player.setVolume(Number(($event.target as HTMLInputElement).value))"
        class="flex-1 h-1 accent-primary"
      />
    </div>
  </div>
</template>
