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
  const codewordEncrypted = encrypt(codeword, password)
  const user = { id: uuidv4(), username, passwordHash, codewordVerifier, codewordEncrypted, createdAt: new Date().toISOString() }

  db.prepare('INSERT INTO users (id, username, password_hash, codeword_verifier, codeword_encrypted, created_at) VALUES (?,?,?,?,?,?)')
    .run(user.id, user.username, user.passwordHash, user.codewordVerifier, user.codewordEncrypted, user.createdAt)

  const token = signToken({ userId: user.id, username: user.username })
  res.json({ token, username: user.username, codewordEncrypted: user.codewordEncrypted })
})

router.post('/login', async (req, res) => {
  const { username, password, codeword } = req.body
  if (!username || !password)
    return res.status(400).json({ error: 'username and password are required' })

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })

  if (!await bcrypt.compare(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' })

  // Already have encrypted codeword — return it, client decrypts with password
  if (user.codeword_encrypted) {
    const token = signToken({ userId: user.id, username: user.username })
    return res.json({ token, username: user.username, codewordEncrypted: user.codeword_encrypted })
  }

  // First login after migration — need codeword to store encrypted copy
  if (!codeword) return res.status(400).json({ error: 'codeword_required' })
  try {
    if (decrypt(user.codeword_verifier, codeword) !== 'codeword_ok') throw new Error()
  } catch {
    return res.status(401).json({ error: 'Invalid codeword' })
  }
  const codewordEncrypted = encrypt(codeword, password)
  db.prepare('UPDATE users SET codeword_encrypted = ? WHERE id = ?').run(codewordEncrypted, user.id)

  const token = signToken({ userId: user.id, username: user.username })
  res.json({ token, username: user.username, codewordEncrypted })
})

export default router
