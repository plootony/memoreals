import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import { persistCodeword, restoreCodewordSync, decryptCWWithPassword, PIN_KEY } from '@/lib/pinCrypto'

const BASE = '/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const username = ref<string | null>(localStorage.getItem('username'))

  // On startup: if token exists and no PIN set — restore codeword synchronously from localStorage
  let initialCodeword = sessionStorage.getItem('codeword')
  if (token.value && !initialCodeword && !localStorage.getItem(PIN_KEY)) {
    initialCodeword = restoreCodewordSync()
    if (initialCodeword) sessionStorage.setItem('codeword', initialCodeword)
  }
  const codeword = ref<string | null>(initialCodeword)

  const isAuthenticated = computed(() => !!token.value && !!codeword.value)
  const needsCodeword = computed(() => !!token.value && !codeword.value)

  async function register(data: { username: string; password: string; codeword: string }) {
    const res = await axios.post(`${BASE}/auth/register`, data)
    await _setSession(res.data, data.codeword)
  }

  async function login(data: { username: string; password: string; codeword?: string }) {
    const res = await axios.post(`${BASE}/auth/login`, data)
    // Codeword was provided manually (migration case) or decrypt it from server's encrypted blob
    const cw = data.codeword || await decryptCWWithPassword(res.data.codewordEncrypted, data.password)
    await _setSession(res.data, cw)
  }

  async function _setSession(data: { token: string; username: string }, cw: string) {
    token.value = data.token
    username.value = data.username
    codeword.value = cw
    sessionStorage.setItem('codeword', cw)
    localStorage.setItem('token', data.token)
    localStorage.setItem('username', data.username)
    await persistCodeword(cw, localStorage.getItem(PIN_KEY) || null)
  }

  // Called when user changes codeword in Settings — persists to localStorage
  async function setCodeword(cw: string) {
    codeword.value = cw
    sessionStorage.setItem('codeword', cw)
    await persistCodeword(cw, localStorage.getItem(PIN_KEY) || null)
  }

  // Called by lock store on PIN unlock — no re-persist needed, already stored
  function restoreSession(cw: string) {
    codeword.value = cw
    sessionStorage.setItem('codeword', cw)
  }

  function logout() {
    token.value = null
    codeword.value = null
    username.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    sessionStorage.removeItem('codeword')
    // Persisted codeword stays in localStorage so it can be auto-restored on next login
  }

  return { token, codeword, username, isAuthenticated, needsCodeword, register, login, logout, setCodeword, restoreSession }
})
