import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import db from '../db/sqlite.js'
import { encryptField, decryptField } from '../utils/fieldCrypto.js'

const router = Router()
router.use(requireAuth)

function topicWithChapters(topic, codeword) {
  const chapters = db.prepare('SELECT * FROM study_chapters WHERE topic_id = ? ORDER BY position').all(topic.id)
  return {
    id: topic.id, title: topic.title, description: topic.description,
    createdAt: topic.created_at, updatedAt: topic.updated_at,
    chapters: chapters.map(c => ({
      id: c.id, title: c.title, content: decryptField(c.content, codeword),
      order: c.position, createdAt: c.created_at, updatedAt: c.updated_at
    }))
  }
}

router.get('/topics', (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const topics = db.prepare('SELECT * FROM study_topics WHERE user_id = ? ORDER BY created_at').all(req.user.userId)
    res.json(topics.map(t => topicWithChapters(t, codeword)))
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/topics', (req, res) => {
  const now = new Date().toISOString()
  const t = { id: uuidv4(), user_id: req.user.userId, title: req.body.title, description: req.body.description || '', created_at: now, updated_at: now }
  db.prepare('INSERT INTO study_topics (id, user_id, title, description, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(t.id, t.user_id, t.title, t.description, t.created_at, t.updated_at)
  res.json({ id: t.id, title: t.title, description: t.description, createdAt: now, updatedAt: now, chapters: [] })
})

router.put('/topics/:id', (req, res) => {
  const { codeword } = req.headers
  const now = new Date().toISOString()
  const row = db.prepare('SELECT * FROM study_topics WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
  if (!row) return res.status(404).json({ error: 'Not found' })
  const title = req.body.title ?? row.title
  const description = req.body.description ?? row.description
  db.prepare('UPDATE study_topics SET title=?, description=?, updated_at=? WHERE id=?').run(title, description, now, row.id)
  res.json(topicWithChapters({ ...row, title, description, updated_at: now }, codeword || ''))
})

router.delete('/topics/:id', (req, res) => {
  db.prepare('DELETE FROM study_chapters WHERE topic_id = ?').run(req.params.id)
  db.prepare('DELETE FROM study_topics WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId)
  res.json({ ok: true })
})

router.post('/topics/:id/chapters', (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  const topic = db.prepare('SELECT * FROM study_topics WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
  if (!topic) return res.status(404).json({ error: 'Not found' })
  const pos = db.prepare('SELECT COUNT(*) as cnt FROM study_chapters WHERE topic_id = ?').get(topic.id).cnt
  const now = new Date().toISOString()
  const c = { id: uuidv4(), topic_id: topic.id, title: req.body.title, content: encryptField(req.body.content || '', codeword), position: pos, created_at: now, updated_at: now }
  db.prepare('INSERT INTO study_chapters (id, topic_id, title, content, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(c.id, c.topic_id, c.title, c.content, c.position, c.created_at, c.updated_at)
  db.prepare('UPDATE study_topics SET updated_at=? WHERE id=?').run(now, topic.id)
  res.json({ id: c.id, title: c.title, content: req.body.content || '', order: c.position, createdAt: now, updatedAt: now })
})

router.put('/topics/:id/chapters/:chapterId', (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const chapter = db.prepare('SELECT * FROM study_chapters WHERE id = ? AND topic_id = ?').get(req.params.chapterId, req.params.id)
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })
    const now = new Date().toISOString()
    const title = req.body.title ?? chapter.title
    const content = req.body.content !== undefined ? encryptField(req.body.content, codeword) : chapter.content
    const rawContent = req.body.content !== undefined ? req.body.content : decryptField(chapter.content, codeword)
    db.prepare('UPDATE study_chapters SET title=?, content=?, updated_at=? WHERE id=?').run(title, content, now, chapter.id)
    db.prepare('UPDATE study_topics SET updated_at=? WHERE id=?').run(now, req.params.id)
    res.json({ id: chapter.id, title, content: rawContent, order: chapter.position, createdAt: chapter.created_at, updatedAt: now })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/topics/:id/chapters/:chapterId', (req, res) => {
  db.prepare('DELETE FROM study_chapters WHERE id = ? AND topic_id = ?').run(req.params.chapterId, req.params.id)
  db.prepare('UPDATE study_topics SET updated_at=? WHERE id=?').run(new Date().toISOString(), req.params.id)
  res.json({ ok: true })
})

export default router
