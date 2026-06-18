<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Card from '@/components/ui/Card.vue'

const router = useRouter()
const auth = useAuthStore()

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const codeword = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    if (mode.value === 'register') {
      await auth.register({ username: username.value, password: password.value, codeword: codeword.value })
    } else {
      await auth.login({ username: username.value, password: password.value, codeword: codeword.value })
    }
    router.push('/')
  } catch (e: any) {
    const status = e.response?.status
    const msg = e.response?.data?.error
    const net = e.code || e.message
    error.value = msg || (status ? `HTTP ${status}` : `Сеть: ${net}`)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background px-4">
    <Card class="w-full max-w-sm p-8">
      <h1 class="text-2xl font-bold text-center mb-2">MemoReals</h1>
      <p class="text-muted-foreground text-center text-sm mb-6">
        {{ mode === 'login' ? 'Войдите в свой аккаунт' : 'Создайте аккаунт' }}
      </p>

      <form @submit.prevent="submit" class="space-y-4">
        <div class="space-y-1.5">
          <Label for="username">Логин</Label>
          <Input id="username" v-model="username" placeholder="username" autocomplete="username" />
        </div>
        <div class="space-y-1.5">
          <Label for="password">Пароль</Label>
          <Input id="password" v-model="password" type="password" placeholder="••••••••" autocomplete="current-password" />
        </div>
        <div class="space-y-1.5">
          <Label for="codeword">Кодовое слово</Label>
          <Input id="codeword" v-model="codeword" type="password" placeholder="Ключ шифрования данных" />
          <p class="text-xs text-muted-foreground">Без него данные невозможно расшифровать. Не забывайте его.</p>
        </div>

        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

        <Button type="submit" class="w-full" :disabled="loading">
          {{ loading ? 'Загрузка...' : (mode === 'login' ? 'Войти' : 'Зарегистрироваться') }}
        </Button>
      </form>

      <p class="text-center text-sm text-muted-foreground mt-4">
        {{ mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?' }}
        <button
          class="text-primary font-medium hover:underline ml-1"
          @click="mode = mode === 'login' ? 'register' : 'login'"
        >
          {{ mode === 'login' ? 'Создать' : 'Войти' }}
        </button>
      </p>
    </Card>
  </div>
</template>
