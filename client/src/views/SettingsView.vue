<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useLockStore } from '@/stores/lock'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Button from '@/components/ui/Button.vue'
import Label from '@/components/ui/Label.vue'
import { Lock, User, Key, Shield, LogOut, Download, Loader2, Database, RotateCcw, Plus, Trash2 } from 'lucide-vue-next'

const auth = useAuthStore()
const lock = useLockStore()
const router = useRouter()

// ── Username ──────────────────────────────────────────────────────────────────
const newUsername = ref('')
const usernamePassword = ref('')
const usernameMsg = ref('')
const usernameError = ref(false)

async function changeUsername() {
  usernameMsg.value = ''
  try {
    const r = await api.put('/settings/username', { newUsername: newUsername.value, password: usernamePassword.value })
    auth.username = r.data.username
    localStorage.setItem('username', r.data.username)
    usernameMsg.value = 'Логин изменён'; usernameError.value = false
    newUsername.value = ''; usernamePassword.value = ''
  } catch (e: any) {
    usernameMsg.value = e.response?.data?.error || 'Ошибка'; usernameError.value = true
  }
}

// ── Password ──────────────────────────────────────────────────────────────────
const currentPassword = ref('')
const newPassword = ref('')
const newPassword2 = ref('')
const passwordMsg = ref('')
const passwordError = ref(false)

async function changePassword() {
  passwordMsg.value = ''
  if (newPassword.value !== newPassword2.value) { passwordMsg.value = 'Пароли не совпадают'; passwordError.value = true; return }
  try {
    await api.put('/settings/password', { currentPassword: currentPassword.value, newPassword: newPassword.value })
    passwordMsg.value = 'Пароль изменён'; passwordError.value = false
    currentPassword.value = ''; newPassword.value = ''; newPassword2.value = ''
  } catch (e: any) {
    passwordMsg.value = e.response?.data?.error || 'Ошибка'; passwordError.value = true
  }
}

// ── Codeword ──────────────────────────────────────────────────────────────────
const codePassword = ref('')
const newCodeword = ref('')
const newCodeword2 = ref('')
const codewordMsg = ref('')
const codewordError = ref(false)

async function changeCodeword() {
  codewordMsg.value = ''
  if (newCodeword.value !== newCodeword2.value) { codewordMsg.value = 'Кодовые слова не совпадают'; codewordError.value = true; return }
  try {
    await api.put('/settings/codeword', { newCodeword: newCodeword.value, password: codePassword.value })
    await auth.setCodeword(newCodeword.value)
    codewordMsg.value = 'Кодовое слово изменено'; codewordError.value = false
    codePassword.value = ''; newCodeword.value = ''; newCodeword2.value = ''
  } catch (e: any) {
    codewordMsg.value = e.response?.data?.error || 'Ошибка'; codewordError.value = true
  }
}

// ── Lock PIN ──────────────────────────────────────────────────────────────────
const newPin = ref(lock.pin)
const newPin2 = ref('')
const pinMsg = ref('')
const pinError = ref(false)

const timeoutOptions = [
  { label: 'Выключено', value: 0 },
  { label: '1 минута', value: 1 },
  { label: '5 минут', value: 5 },
  { label: '10 минут', value: 10 },
  { label: '30 минут', value: 30 },
]

async function savePin() {
  pinMsg.value = ''
  if (newPin.value && newPin.value !== newPin2.value) { pinMsg.value = 'Коды не совпадают'; pinError.value = true; return }
  await lock.setPin(newPin.value)
  pinMsg.value = newPin.value ? 'Код сохранён' : 'Блокировка отключена'
  pinError.value = false
  newPin2.value = ''
}

const exporting = ref(false)
async function exportData() {
  exporting.value = true
  try {
    const res = await api.get('/export', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `memoreals-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  } finally {
    exporting.value = false
  }
}

function lockNow() {
  if (!lock.hasPin) { pinMsg.value = 'Сначала установите код'; pinError.value = true; return }
  lock.lock()
}

function logout() {
  auth.logout()
  router.push('/login')
}

// ── Backup ────────────────────────────────────────────────────────────────────
interface Backup { key: string; name: string; size: number; date: string }

const backups = ref<Backup[]>([])
const backupLoading = ref(false)
const backupCreating = ref(false)
const restoring = ref<string | null>(null)
const confirmRestore = ref<Backup | null>(null)

async function loadBackups() {
  backupLoading.value = true
  try {
    const r = await api.get('/backup')
    backups.value = r.data
  } finally {
    backupLoading.value = false
  }
}

async function createBackup() {
  backupCreating.value = true
  try {
    await api.post('/backup/create')
    await loadBackups()
  } finally {
    backupCreating.value = false
  }
}

async function restoreBackup(backup: Backup) {
  confirmRestore.value = null
  restoring.value = backup.key
  try {
    await api.post('/backup/restore', { key: backup.key })
    setTimeout(() => { restoring.value = null }, 3000)
  } catch {
    restoring.value = null
  }
}

async function deleteBackup(backup: Backup) {
  await api.delete('/backup', { data: { key: backup.key } })
  backups.value = backups.value.filter(b => b.key !== backup.key)
}

function formatSize(bytes: number) {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} МБ`
    : `${Math.round(bytes / 1024)} КБ`
}

function formatBackupDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('ru', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(loadBackups)
</script>

<template>
  <div class="max-w-xl space-y-6">
    <h1 class="text-2xl font-bold">Настройки</h1>

    <!-- Username -->
    <Card class="p-5 space-y-4">
      <div class="flex items-center gap-2 mb-1">
        <User class="w-4 h-4 text-muted-foreground" />
        <h2 class="font-semibold">Изменить логин</h2>
      </div>
      <p class="text-xs text-muted-foreground">Текущий: <span class="font-medium text-foreground">{{ auth.username }}</span></p>
      <div class="space-y-3">
        <div class="space-y-1"><Label>Новый логин</Label><Input v-model="newUsername" placeholder="новый логин" /></div>
        <div class="space-y-1"><Label>Пароль для подтверждения</Label><Input v-model="usernamePassword" type="password" placeholder="••••••••" /></div>
      </div>
      <div class="flex items-center gap-3">
        <Button @click="changeUsername" :disabled="!newUsername || !usernamePassword">Сохранить</Button>
        <p v-if="usernameMsg" :class="['text-sm', usernameError ? 'text-destructive' : 'text-green-500']">{{ usernameMsg }}</p>
      </div>
    </Card>

    <!-- Password -->
    <Card class="p-5 space-y-4">
      <div class="flex items-center gap-2 mb-1">
        <Key class="w-4 h-4 text-muted-foreground" />
        <h2 class="font-semibold">Изменить пароль</h2>
      </div>
      <div class="space-y-3">
        <div class="space-y-1"><Label>Текущий пароль</Label><Input v-model="currentPassword" type="password" placeholder="••••••••" /></div>
        <div class="space-y-1"><Label>Новый пароль</Label><Input v-model="newPassword" type="password" placeholder="••••••••" /></div>
        <div class="space-y-1"><Label>Повторите новый пароль</Label><Input v-model="newPassword2" type="password" placeholder="••••••••" /></div>
      </div>
      <div class="flex items-center gap-3">
        <Button @click="changePassword" :disabled="!currentPassword || !newPassword || !newPassword2">Сохранить</Button>
        <p v-if="passwordMsg" :class="['text-sm', passwordError ? 'text-destructive' : 'text-green-500']">{{ passwordMsg }}</p>
      </div>
    </Card>

    <!-- Codeword -->
    <Card class="p-5 space-y-4">
      <div class="flex items-center gap-2 mb-1">
        <Shield class="w-4 h-4 text-muted-foreground" />
        <h2 class="font-semibold">Изменить кодовое слово</h2>
      </div>
      <div class="rounded-md bg-orange-500/10 border border-orange-500/20 p-3 text-xs text-orange-600 dark:text-orange-400">
        Все данные будут автоматически перешифрованы. Не забудьте новое слово — без него данные недоступны.
      </div>
      <div class="space-y-3">
        <div class="space-y-1"><Label>Пароль для подтверждения</Label><Input v-model="codePassword" type="password" placeholder="••••••••" /></div>
        <div class="space-y-1"><Label>Новое кодовое слово</Label><Input v-model="newCodeword" type="password" placeholder="новое кодовое слово" /></div>
        <div class="space-y-1"><Label>Повторите кодовое слово</Label><Input v-model="newCodeword2" type="password" placeholder="повторите" /></div>
      </div>
      <div class="flex items-center gap-3">
        <Button @click="changeCodeword" :disabled="!codePassword || !newCodeword || !newCodeword2">Сохранить</Button>
        <p v-if="codewordMsg" :class="['text-sm', codewordError ? 'text-destructive' : 'text-green-500']">{{ codewordMsg }}</p>
      </div>
    </Card>

    <!-- Lock PIN -->
    <Card class="p-5 space-y-4">
      <div class="flex items-center gap-2 mb-1">
        <Lock class="w-4 h-4 text-muted-foreground" />
        <h2 class="font-semibold">Блокировка экрана</h2>
      </div>
      <div class="space-y-3">
        <div class="space-y-1">
          <Label>Автоблокировка</Label>
          <select :value="lock.timeoutMinutes" @change="lock.setTimeout(Number(($event.target as HTMLSelectElement).value))"
            class="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option v-for="o in timeoutOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
        <div class="space-y-1">
          <Label>Код разблокировки {{ lock.pin ? '(установлен)' : '(не установлен)' }}</Label>
          <Input v-model="newPin" type="password" placeholder="новый код (цифры или текст)" />
        </div>
        <div v-if="newPin" class="space-y-1">
          <Label>Повторите код</Label>
          <Input v-model="newPin2" type="password" placeholder="повторите код" />
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <Button @click="savePin">{{ newPin ? 'Сохранить код' : 'Отключить блокировку' }}</Button>
        <Button variant="outline" @click="lockNow" :disabled="!lock.hasPin">
          <Lock class="w-4 h-4 mr-2" />Заблокировать
        </Button>
        <p v-if="pinMsg" :class="['text-sm', pinError ? 'text-destructive' : 'text-green-500']">{{ pinMsg }}</p>
      </div>
    </Card>

    <!-- Export -->
    <Card class="p-5 space-y-3">
      <div class="flex items-center gap-2">
        <Download class="w-4 h-4 text-muted-foreground" />
        <h2 class="font-semibold">Резервная копия</h2>
      </div>
      <p class="text-sm text-muted-foreground">Скачайте все ваши данные в формате JSON.</p>
      <Button variant="outline" @click="exportData" :disabled="exporting" class="w-full justify-start">
        <Loader2 v-if="exporting" class="w-4 h-4 mr-2 animate-spin" />
        <Download v-else class="w-4 h-4 mr-2" />
        {{ exporting ? 'Подготовка...' : 'Скачать данные' }}
      </Button>
    </Card>

    <!-- Backup -->
    <Card class="p-5 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Database class="w-4 h-4 text-muted-foreground" />
          <h2 class="font-semibold">Резервные копии</h2>
        </div>
        <Button size="sm" @click="createBackup" :disabled="backupCreating">
          <Loader2 v-if="backupCreating" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
          <Plus v-else class="w-3.5 h-3.5 mr-1.5" />
          {{ backupCreating ? 'Создаётся...' : 'Создать сейчас' }}
        </Button>
      </div>

      <div v-if="backupLoading" class="text-sm text-muted-foreground text-center py-4">
        <Loader2 class="w-4 h-4 animate-spin inline mr-2" />Загрузка...
      </div>

      <div v-else-if="backups.length === 0" class="text-sm text-muted-foreground text-center py-4">
        Нет бэкапов
      </div>

      <div v-else class="space-y-2">
        <div v-for="b in backups" :key="b.key"
          class="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium">{{ formatBackupDate(b.date) }}</p>
            <p class="text-xs text-muted-foreground">{{ formatSize(b.size) }}</p>
          </div>
          <Button size="sm" variant="outline"
            :disabled="restoring !== null"
            @click="confirmRestore = b">
            <RotateCcw class="w-3.5 h-3.5 mr-1.5" />
            {{ restoring === b.key ? 'Восстанавливаю...' : 'Восстановить' }}
          </Button>
          <button class="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
            @click="deleteBackup(b)">
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Card>

    <!-- Danger zone -->
    <Card class="p-5">
      <Button variant="ghost" class="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-start" @click="logout">
        <LogOut class="w-4 h-4 mr-2" />Выйти из аккаунта
      </Button>
    </Card>
  </div>

  <!-- Confirm restore modal -->
  <div v-if="confirmRestore" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <Card class="w-full max-w-sm p-6 space-y-4">
      <h2 class="font-semibold text-lg">Восстановить бэкап?</h2>
      <p class="text-sm text-muted-foreground">
        Все текущие данные будут заменены данными из копии
        <span class="font-medium text-foreground">{{ formatBackupDate(confirmRestore.date) }}</span>.
        Это действие необратимо.
      </p>
      <div class="flex gap-2">
        <Button variant="outline" class="flex-1" @click="confirmRestore = null">Отмена</Button>
        <Button class="flex-1 bg-destructive hover:bg-destructive/90" @click="restoreBackup(confirmRestore!)">
          Восстановить
        </Button>
      </div>
    </Card>
  </div>
</template>
