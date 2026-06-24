import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api'

export interface Track { id: string; title: string; artist: string; filename: string; cover?: string }
export interface Playlist { id: string; name: string; trackIds: string[] }

const audio = new Audio()

export const usePlayerStore = defineStore('player', () => {
  const tracks = ref<Track[]>([])
  const playlists = ref<Playlist[]>([])
  const currentTrack = ref<Track | null>(null)
  const currentIndex = ref(-1)
  const isPlaying = ref(false)
  const shuffle = ref(false)
  const repeat = ref(false)
  const volume = ref(1)
  const progress = ref(0)
  const duration = ref(0)
  const activePlaylist = ref<Playlist | null>(null)

  const queue = computed<Track[]>(() => {
    if (activePlaylist.value) {
      return activePlaylist.value.trackIds
        .map(id => tracks.value.find(t => t.id === id))
        .filter(Boolean) as Track[]
    }
    return tracks.value
  })

  audio.ontimeupdate = () => {
    progress.value = audio.currentTime
    duration.value = audio.duration || 0
  }
  audio.onplay = () => { isPlaying.value = true }
  audio.onpause = () => { isPlaying.value = false }
  audio.onended = () => {
    if (repeat.value) { audio.currentTime = 0; audio.play() } else next()
  }

  function trackUrl(track: Track) {
    return `/uploads/${track.filename}`
  }

  function safePlay() {
    const p = audio.play()
    if (p !== undefined) p.catch(err => {
      if (err.name !== 'AbortError') console.error('audio play error:', err)
    })
  }

  function play(track: Track, idx: number) {
    currentTrack.value = track
    currentIndex.value = idx
    audio.src = trackUrl(track)
    safePlay()
  }

  function togglePlay() {
    if (!currentTrack.value && queue.value.length) {
      play(queue.value[0], 0)
    } else if (isPlaying.value) {
      audio.pause()
    } else {
      safePlay()
    }
  }

  function next() {
    if (!queue.value.length) return
    const idx = shuffle.value
      ? Math.floor(Math.random() * queue.value.length)
      : (currentIndex.value + 1) % queue.value.length
    play(queue.value[idx], idx)
  }

  function prev() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return }
    const idx = (currentIndex.value - 1 + queue.value.length) % queue.value.length
    play(queue.value[idx], idx)
  }

  function seek(val: number) { audio.currentTime = val }
  function setVolume(val: number) { volume.value = val; audio.volume = val }

  async function load() {
    const [tr, pl] = await Promise.all([api.get('/music/tracks'), api.get('/music/playlists')])
    tracks.value = tr.data
    playlists.value = pl.data
    if (activePlaylist.value) {
      activePlaylist.value = playlists.value.find(p => p.id === activePlaylist.value!.id) || null
    }
  }

  async function addToPlaylist(playlistId: string, trackId: string) {
    const pl = playlists.value.find(p => p.id === playlistId)
    if (!pl || pl.trackIds.includes(trackId)) return
    await api.put(`/music/playlists/${playlistId}`, { trackIds: [...pl.trackIds, trackId] })
    await load()
  }

  async function deleteTrack(id: string) {
    await api.delete(`/music/tracks/${id}`)
    if (currentTrack.value?.id === id) { audio.pause(); currentTrack.value = null }
    await load()
  }

  async function updateTrack(id: string, patch: Partial<Pick<Track, 'title' | 'artist' | 'cover'>>) {
    const res = await api.put(`/music/tracks/${id}`, patch)
    const idx = tracks.value.findIndex(t => t.id === id)
    if (idx !== -1) tracks.value[idx] = res.data
    if (currentTrack.value?.id === id) currentTrack.value = res.data
  }

  async function deletePlaylist(id: string) {
    await api.delete(`/music/playlists/${id}`)
    if (activePlaylist.value?.id === id) activePlaylist.value = null
    await load()
  }

  async function renamePlaylist(id: string, name: string) {
    await api.put(`/music/playlists/${id}`, { name })
    await load()
  }

  async function removeFromPlaylist(playlistId: string, trackId: string) {
    const pl = playlists.value.find(p => p.id === playlistId)
    if (!pl) return
    await api.put(`/music/playlists/${playlistId}`, { trackIds: pl.trackIds.filter(id => id !== trackId) })
    await load()
  }

  return {
    tracks, playlists, currentTrack, currentIndex,
    isPlaying, shuffle, repeat, volume, progress, duration,
    activePlaylist, queue,
    play, togglePlay, next, prev, seek, setVolume, load,
    addToPlaylist, deleteTrack, updateTrack,
    deletePlaylist, renamePlaylist, removeFromPlaylist,
  }
})
