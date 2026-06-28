import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { requireAuth } from '../middleware/auth.js'
import { encrypt, decrypt } from '../utils/crypto.js'
import { encryptField, decryptField } from '../utils/fieldCrypto.js'
import db from '../db/sqlite.js'

const router = Router()
router.use(requireAuth)

router.put('/username', async (req, res) => {
  const { newUsername, password } = req.body
  if (!newUsername || !password) return res.status(400).json({ error: 'newUsername and password required' })
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId)
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (!await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'Wrong password' })
  if (db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(newUsername, user.id)) return res.status(409).json({ error: 'Username already taken' })
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(newUsername, user.id)
  res.json({ ok: true, username: newUsername })
})

router.put('/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword required' })
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId)
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (!await bcrypt.compare(currentPassword, user.password_hash)) return res.status(401).json({ error: 'Wrong current password' })
  const newHash = await bcrypt.hash(newPassword, 12)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id)
  // Re-encrypt codeword with new password so next login works
  const codeword = req.headers.codeword
  if (codeword && user.codeword_encrypted) {
    db.prepare('UPDATE users SET codeword_encrypted = ? WHERE id = ?').run(encrypt(codeword, newPassword), user.id)
  }
  res.json({ ok: true })
})

// Re-encrypts journal.content and study chapter content with new codeword
router.put('/codeword', async (req, res) => {
  const { codeword } = req.headers
  const { newCodeword, password } = req.body
  if (!codeword || !newCodeword || !password) return res.status(400).json({ error: 'codeword header, newCodeword and password required' })
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId)
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (!await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'Wrong password' })
  try {
    if (decrypt(user.codeword_verifier, codeword) !== 'codeword_ok') throw new Error()
  } catch {
    return res.status(401).json({ error: 'Wrong codeword' })
  }
  const uid = req.user.userId
  db.transaction(() => {
    // Re-encrypt journal content
    for (const row of db.prepare('SELECT id, content FROM journal WHERE user_id = ?').all(uid)) {
      const plain = decryptField(row.content, codeword)
      db.prepare('UPDATE journal SET content = ? WHERE id = ?').run(encryptField(plain, newCodeword), row.id)
    }
    // Re-encrypt study chapters content
    for (const topic of db.prepare('SELECT id FROM study_topics WHERE user_id = ?').all(uid)) {
      for (const ch of db.prepare('SELECT id, content FROM study_chapters WHERE topic_id = ?').all(topic.id)) {
        const plain = decryptField(ch.content, codeword)
        db.prepare('UPDATE study_chapters SET content = ? WHERE id = ?').run(encryptField(plain, newCodeword), ch.id)
      }
    }
    // Update verifier and encrypted copy
    db.prepare('UPDATE users SET codeword_verifier = ?, codeword_encrypted = ? WHERE id = ?')
      .run(encrypt('codeword_ok', newCodeword), encrypt(newCodeword, password), uid)
  })()
  res.json({ ok: true })
})

export default router
