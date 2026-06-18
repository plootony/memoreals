import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { authDb } from '../db/index.js'
import { requireAuth } from '../middleware/auth.js'
import { encrypt, decrypt } from '../utils/crypto.js'
import { getUserData, setUserData } from '../db/userStore.js'

const router = Router()
router.use(requireAuth)

// PUT /api/settings/username
router.put('/username', async (req, res) => {
  const { newUsername, password } = req.body
  if (!newUsername || !password) return res.status(400).json({ error: 'newUsername and password required' })
  try {
    await authDb.read()
    const user = authDb.data.users.find(u => u.id === req.user.userId)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (!await bcrypt.compare(password, user.passwordHash)) return res.status(401).json({ error: 'Wrong password' })
    const taken = authDb.data.users.find(u => u.username === newUsername && u.id !== user.id)
    if (taken) return res.status(409).json({ error: 'Username already taken' })
    user.username = newUsername
    await authDb.write()
    res.json({ ok: true, username: newUsername })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/settings/password
router.put('/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword required' })
  try {
    await authDb.read()
    const user = authDb.data.users.find(u => u.id === req.user.userId)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (!await bcrypt.compare(currentPassword, user.passwordHash)) return res.status(401).json({ error: 'Wrong current password' })
    user.passwordHash = await bcrypt.hash(newPassword, 12)
    await authDb.write()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/settings/codeword — перешифровывает все данные пользователя
router.put('/codeword', async (req, res) => {
  const { codeword } = req.headers
  const { newCodeword, password } = req.body
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  if (!newCodeword || !password) return res.status(400).json({ error: 'newCodeword and password required' })
  try {
    await authDb.read()
    const user = authDb.data.users.find(u => u.id === req.user.userId)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (!await bcrypt.compare(password, user.passwordHash)) return res.status(401).json({ error: 'Wrong password' })

    // Проверяем старое кодовое слово
    try {
      const check = decrypt(user.codewordVerifier, codeword)
      if (check !== 'codeword_ok') throw new Error()
    } catch {
      return res.status(401).json({ error: 'Wrong codeword' })
    }

    // Перешифровываем все данные
    const data = await getUserData(req.user.userId, codeword)
    await setUserData(req.user.userId, newCodeword, data)

    // Обновляем верификатор
    user.codewordVerifier = encrypt('codeword_ok', newCodeword)
    await authDb.write()

    res.json({ ok: true })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

export default router
