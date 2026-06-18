import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

const BASE = 'http://localhost:3001/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const codeword = ref<string | null>(sessionStorage.getItem('codeword'))
  const username = ref<string | null>(localStorage.getItem('username'))

  const isAuthenticated = computed(() => !!token.value && !!codeword.value)

  async function register(data: { username: string; password: string; codeword: string }) {
    const res = await axios.post(`${BASE}/auth/register`, data)
    _setSession(res.data, data.codeword)
  }

  async function login(data: { username: string; password: string; codeword: string }) {
    const res = await axios.post(`${BASE}/auth/login`, data)
    _setSession(res.data, data.codeword)
  }

  function _setSession(data: { token: string; username: string; codeword?: string }, cw?: string) {
    token.value = data.token
    username.value = data.username
    const cw2 = cw || (data as any).codeword
    if (cw2) {
      codeword.value = cw2
      sessionStorage.setItem('codeword', cw2)
    }
    localStorage.setItem('token', data.token)
    localStorage.setItem('username', data.username)
  }

  function setCodeword(cw: string) {
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
  }

  return { token, codeword, username, isAuthenticated, register, login, logout, setCodeword }
})
