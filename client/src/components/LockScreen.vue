<script setup lang="ts">
import { ref } from 'vue'
import { useLockStore } from '@/stores/lock'
import { useAuthStore } from '@/stores/auth'
import { Lock } from 'lucide-vue-next'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'

const lock = useLockStore()
const auth = useAuthStore()

const input = ref('')
const error = ref(false)
const codewordInput = ref('')
const codewordLoading = ref(false)
const digits = [1,2,3,4,5,6,7,8,9,0]

function press(d: number | 'del') {
  error.value = false
  if (d === 'del') { input.value = input.value.slice(0, -1); return }
  if (input.value.length >= 8) return
  input.value += d
  if (input.value.length >= lock.pin.length) attempt()
}

async function attempt() {
  const ok = await lock.unlock(input.value)
  if (ok) {
    input.value = ''
    error.value = false
  } else {
    error.value = true
    setTimeout(() => { input.value = ''; error.value = false }, 800)
  }
}

async function submitCodeword() {
  if (!codewordInput.value || codewordLoading.value) return
  codewordLoading.value = true
  try {
    await auth.setCodeword(codewordInput.value)
    codewordInput.value = ''
  } finally {
    codewordLoading.value = false
  }
}
</script>

<template>
  <Transition name="lock">
    <div v-if="lock.isLocked || auth.needsCodeword"
      class="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">

      <div class="flex flex-col items-center gap-6 w-full max-w-xs px-8">
        <div class="p-4 rounded-full bg-muted">
          <Lock class="w-8 h-8 text-muted-foreground" />
        </div>

        <!-- PIN pad mode -->
        <template v-if="lock.isLocked">
          <div class="text-center">
            <h2 class="text-xl font-semibold">Заблокировано</h2>
            <p class="text-sm text-muted-foreground mt-1">Введите код для входа</p>
          </div>
          <div class="flex gap-3">
            <div v-for="i in lock.pin.length" :key="i"
              :class="['w-3 h-3 rounded-full border-2 transition-all',
                error ? 'border-destructive bg-destructive' :
                i <= input.length ? 'border-primary bg-primary' : 'border-muted-foreground']" />
          </div>
          <div class="grid grid-cols-3 gap-3 w-full">
            <button v-for="d in digits" :key="d"
              :class="['h-14 rounded-xl text-xl font-medium transition-colors',
                d === 0 ? 'col-start-2' : '',
                'bg-muted hover:bg-accent active:scale-95']"
              @click="press(d)">
              {{ d }}
            </button>
            <button class="h-14 rounded-xl text-sm font-medium bg-muted hover:bg-accent active:scale-95 col-start-3"
              @click="press('del')">
              ⌫
            </button>
          </div>
        </template>

        <!-- Codeword input mode (PIN not set, session restored from token) -->
        <template v-else>
          <div class="text-center">
            <h2 class="text-xl font-semibold">Добро пожаловать</h2>
            <p class="text-sm text-muted-foreground mt-1">Введите кодовое слово для продолжения</p>
          </div>
          <div class="w-full space-y-3">
            <Input
              v-model="codewordInput"
              type="password"
              placeholder="кодовое слово"
              autofocus
              @keydown.enter="submitCodeword"
            />
            <Button class="w-full" @click="submitCodeword" :disabled="!codewordInput || codewordLoading">
              {{ codewordLoading ? 'Загрузка...' : 'Продолжить' }}
            </Button>
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.lock-enter-active, .lock-leave-active { transition: opacity 0.2s ease; }
.lock-enter-from, .lock-leave-to { opacity: 0; }
</style>
