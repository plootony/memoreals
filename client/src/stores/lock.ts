import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { persistCodeword, restoreCodewordWithPin, PIN_KEY } from '@/lib/pinCrypto'
import { useAuthStore } from '@/stores/auth'

const TIMEOUT_KEY = 'lock_timeout'

export const useLockStore = defineStore('lock', () => {
  const pin = ref(localStorage.getItem(PIN_KEY) || '')
  const timeoutMinutes = ref(Number(localStorage.getItem(TIMEOUT_KEY) || '5'))
  const hasPin = computed(() => pin.value.length > 0)
  const isLocked = ref(hasPin.value)

  let timer: ReturnType<typeof setTimeout> | null = null

  function lock() {
    if (!hasPin.value) return
    isLocked.value = true
    clearTimer()
  }

  async function unlock(inputPin: string): Promise<boolean> {
    if (inputPin !== pin.value) return false
    const cw = await restoreCodewordWithPin(inputPin)
    if (cw) useAuthStore().restoreSession(cw)
    isLocked.value = false
    resetTimer()
    return true
  }

  async function setPin(newPin: string) {
    const auth = useAuthStore()
    pin.value = newPin
    if (newPin) {
      localStorage.setItem(PIN_KEY, newPin)
      isLocked.value = true
      if (auth.codeword) await persistCodeword(auth.codeword, newPin)
    } else {
      localStorage.removeItem(PIN_KEY)
      isLocked.value = false
      if (auth.codeword) await persistCodeword(auth.codeword, null)
    }
  }

  function setTimeout_(minutes: number) {
    timeoutMinutes.value = minutes
    localStorage.setItem(TIMEOUT_KEY, String(minutes))
    resetTimer()
  }

  function clearTimer() {
    if (timer) { clearTimeout(timer); timer = null }
  }

  function resetTimer() {
    clearTimer()
    if (!hasPin.value || timeoutMinutes.value === 0) return
    timer = setTimeout(() => lock(), timeoutMinutes.value * 60 * 1000)
  }

  function setupActivity() {
    if (!hasPin.value) return
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']
    const handler = () => { if (!isLocked.value) resetTimer() }
    events.forEach(e => window.addEventListener(e, handler, { passive: true }))
    if (!isLocked.value) resetTimer()
  }

  return { isLocked, pin, timeoutMinutes, hasPin, lock, unlock, setPin, setTimeout: setTimeout_, resetTimer, setupActivity }
})
