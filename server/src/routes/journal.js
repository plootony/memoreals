import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import db from '../db/sqlite.js'
import { encryptField, decryptField } from '../utils/fieldCrypto.js'

const router = Router()
router.use(requireAuth)

function decryptEntry(row, codeword) {
  return {
    id: row.id,
    title: row.title,
    content: decryptField(row.content, codeword),
    date: row.date,
    mood: row.mood || '',
    photos: JSON.parse(row.photos || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

router.get('/', (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    let rows = db.prepare('SELECT * FROM journal WHERE user_id = ? ORDER BY date DESC, created_at DESC').all(req.user.userId)
    const { year, month, day, search } = req.query
    if (year) rows = rows.filter(r => r.date.startsWith(year))
    if (month) rows = rows.filter(r => new Date(r.date).getMonth() + 1 === Number(month))
    if (day) rows = rows.filter(r => new Date(r.date).getDate() === Number(day))
    const entries = rows.map(r => decryptEntry(r, codeword))
    if (search) {
      const q = search.toLowerCase()
      return res.json(entries.filter(e => e.title?.toLowerCase().includes(q) || e.content?.toLowerCase().includes(q)))
    }
    res.json(entries)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/', (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const now = new Date().toISOString()
    const date = req.body.date || now.slice(0, 10)
    const entry = {
      id: uuidv4(),
      title: req.body.title || '',
      content: req.body.content || '',
      date,
      mood: req.body.mood || '',
      photos: req.body.photos || [],
    }
    db.prepare('INSERT INTO journal (id, user_id, title, content, date, mood, photos, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(entry.id, req.user.userId, entry.title, encryptField(entry.content, codeword), entry.date, entry.mood, JSON.stringify(entry.photos), now, now)
    res.json({ ...entry, createdAt: now, updatedAt: now })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.put('/:id', (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const now = new Date().toISOString()
    const row = db.prepare('SELECT * FROM journal WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
    if (!row) return res.status(404).json({ error: 'Not found' })
    const updated = {
      title:   req.body.title   !== undefined ? req.body.title   : row.title,
      content: req.body.content !== undefined ? req.body.content : decryptField(row.content, codeword),
      date:    req.body.date    !== undefined ? req.body.date    : row.date,
      mood:    req.body.mood    !== undefined ? req.body.mood    : (row.mood || ''),
      photos:  req.body.photos  !== undefined ? req.body.photos  : JSON.parse(row.photos || '[]'),
    }
    db.prepare('UPDATE journal SET title=?, content=?, date=?, mood=?, photos=?, updated_at=? WHERE id=?')
      .run(updated.title, encryptField(updated.content, codeword), updated.date, updated.mood, JSON.stringify(updated.photos), now, row.id)
    res.json({ id: row.id, ...updated, createdAt: row.created_at, updatedAt: now })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM journal WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId)
  res.json({ ok: true })
})

export default router
