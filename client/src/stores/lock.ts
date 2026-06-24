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

  const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']
  let activityHandler: (() => void) | null = null

  function setupActivity() {
    if (!hasPin.value || activityHandler) return // prevent duplicate listeners
    activityHandler = () => { if (!isLocked.value) resetTimer() }
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, activityHandler!, { passive: true }))
    if (!isLocked.value) resetTimer()
  }

  function teardownActivity() {
    if (!activityHandler) return
    ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, activityHandler!))
    activityHandler = null
    clearTimer()
  }

  return { isLocked, pin, timeoutMinutes, hasPin, lock, unlock, setPin, setTimeout: setTimeout_, resetTimer, setupActivity, teardownActivity }
})
