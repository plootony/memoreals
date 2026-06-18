import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const PIN_KEY = 'lock_pin'
const TIMEOUT_KEY = 'lock_timeout'
const LOCKED_KEY = 'lock_state' // sessionStorage — сбрасывается при закрытии вкладки

export const useLockStore = defineStore('lock', () => {
  const pin = ref(localStorage.getItem(PIN_KEY) || '')
  const timeoutMinutes = ref(Number(localStorage.getItem(TIMEOUT_KEY) || '5'))
  const hasPin = computed(() => pin.value.length > 0)

  // Если PIN установлен — при загрузке/обновлении страницы всегда блокируем
  const isLocked = ref(hasPin.value)

  let timer: ReturnType<typeof setTimeout> | null = null

  function lock() {
    if (!hasPin.value) return
    isLocked.value = true
    clearTimer()
  }

  function unlock(inputPin: string): boolean {
    if (inputPin === pin.value) {
      isLocked.value = false
      resetTimer()
      return true
    }
    return false
  }

  function setPin(newPin: string) {
    pin.value = newPin
    if (newPin) {
      localStorage.setItem(PIN_KEY, newPin)
      isLocked.value = true // сразу блокируем после установки нового PIN
    } else {
      localStorage.removeItem(PIN_KEY)
      isLocked.value = false
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
    // Не запускаем таймер сразу — ждём первого разблокирования
    if (!isLocked.value) resetTimer()
  }

  return { isLocked, pin, timeoutMinutes, hasPin, lock, unlock, setPin, setTimeout: setTimeout_, resetTimer, setupActivity }
})
