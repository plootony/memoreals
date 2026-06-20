import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import db from '../db/sqlite.js'
import { signToken } from '../middleware/auth.js'
import { encrypt, decrypt } from '../utils/crypto.js'

const router = Router()

router.post('/register', async (req, res) => {
  const { username, password, codeword } = req.body
  if (!username || !password || !codeword)
    return res.status(400).json({ error: 'username, password and codeword are required' })

  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username))
    return res.status(409).json({ error: 'User already exists' })

  const passwordHash = await bcrypt.hash(password, 12)
  const codewordVerifier = encrypt('codeword_ok', codeword)
  const user = { id: uuidv4(), username, passwordHash, codewordVerifier, createdAt: new Date().toISOString() }

  db.prepare('INSERT INTO users (id, username, password_hash, codeword_verifier, created_at) VALUES (?,?,?,?,?)')
    .run(user.id, user.username, user.passwordHash, user.codewordVerifier, user.createdAt)

  const token = signToken({ userId: user.id, username: user.username })
  res.json({ token, userId: user.id, username: user.username })
})

router.post('/login', async (req, res) => {
  const { username, password, codeword } = req.body
  if (!username || !password || !codeword)
    return res.status(400).json({ error: 'username, password and codeword are required' })

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })

  if (!await bcrypt.compare(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' })

  try {
    if (decrypt(user.codeword_verifier, codeword) !== 'codeword_ok') throw new Error()
  } catch {
    return res.status(401).json({ error: 'Invalid codeword' })
  }

  const token = signToken({ userId: user.id, username: user.username })
  res.json({ token, userId: user.id, username: user.username })
})

export default router
