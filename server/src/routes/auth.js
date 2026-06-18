import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { authDb } from '../db/index.js'
import { signToken } from '../middleware/auth.js'
import { encrypt, decrypt } from '../utils/crypto.js'

const router = Router()

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, password, codeword } = req.body
  if (!username || !password || !codeword) {
    return res.status(400).json({ error: 'username, password and codeword are required' })
  }

  await authDb.read()
  const existing = authDb.data.users.find(u => u.username === username)
  if (existing) {
    return res.status(409).json({ error: 'User already exists' })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  // Храним зашифрованную версию codeword чтобы проверять его при логине
  // Шифруем codeword самим codeword — если расшифровывается, значит верный
  const codewordVerifier = encrypt('codeword_ok', codeword)

  const user = {
    id: uuidv4(),
    username,
    passwordHash,
    codewordVerifier,
    createdAt: new Date().toISOString()
  }

  authDb.data.users.push(user)
  await authDb.write()

  const token = signToken({ userId: user.id, username: user.username })
  res.json({ token, userId: user.id, username: user.username })
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password, codeword } = req.body
  if (!username || !password || !codeword) {
    return res.status(400).json({ error: 'username, password and codeword are required' })
  }

  await authDb.read()
  const user = authDb.data.users.find(u => u.username === username)
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash)
  if (!passwordOk) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  // Проверяем кодовое слово
  try {
    const check = decrypt(user.codewordVerifier, codeword)
    if (check !== 'codeword_ok') throw new Error()
  } catch {
    return res.status(401).json({ error: 'Invalid codeword' })
  }

  const token = signToken({ userId: user.id, username: user.username })
  res.json({ token, userId: user.id, username: user.username })
})

export default router
