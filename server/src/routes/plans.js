import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import db from '../db/sqlite.js'

const router = Router()
router.use(requireAuth)

function getAll(userId) {
  const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC').all(userId).map(rowToTask)
  const cats = db.prepare('SELECT name FROM plan_categories WHERE user_id = ?').all(userId).map(r => r.name)
  const settings = db.prepare('SELECT * FROM plan_settings WHERE user_id = ?').get(userId) || { remind_interval: 30 }
  return { tasks, categories: cats, settings: { remindInterval: settings.remind_interval } }
}

function rowToTask(r) {
  return { id: r.id, title: r.title, description: r.description, category: r.category, priority: r.priority, status: r.status, deadline: r.deadline, remindBefore: r.remind_before, createdAt: r.created_at, completedAt: r.completed_at }
}

router.get('/tasks', (req, res) => res.json(getAll(req.user.userId)))

router.post('/tasks', (req, res) => {
  const now = new Date().toISOString()
  const t = { id: uuidv4(), user_id: req.user.userId, title: req.body.title, description: req.body.description || '', category: req.body.category || '', priority: req.body.priority || 'medium', status: 'todo', deadline: req.body.deadline || null, remind_before: req.body.remindBefore ?? null, created_at: now, completed_at: null }
  db.prepare('INSERT INTO tasks (id, user_id, title, description, category, priority, status, deadline, remind_before, created_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(t.id, t.user_id, t.title, t.description, t.category, t.priority, t.status, t.deadline, t.remind_before, t.created_at, t.completed_at)
  res.json(getAll(req.user.userId))
})

router.put('/tasks/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
  if (!row) return res.status(404).json({ error: 'Not found' })
  const now = new Date().toISOString()
  const completedAt = req.body.status === 'done' && row.status !== 'done' ? now : (req.body.status !== 'done' ? null : row.completed_at)
  const up = { title: req.body.title ?? row.title, description: req.body.description ?? row.description, category: req.body.category ?? row.category, priority: req.body.priority ?? row.priority, status: req.body.status ?? row.status, deadline: req.body.deadline !== undefined ? req.body.deadline : row.deadline, remind_before: req.body.remindBefore !== undefined ? req.body.remindBefore : row.remind_before, completed_at: completedAt }
  db.prepare('UPDATE tasks SET title=?, description=?, category=?, priority=?, status=?, deadline=?, remind_before=?, completed_at=? WHERE id=?').run(up.title, up.description, up.category, up.priority, up.status, up.deadline, up.remind_before, up.completed_at, row.id)
  res.json(getAll(req.user.userId))
})

router.delete('/tasks/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId)
  res.json(getAll(req.user.userId))
})

router.post('/categories', (req, res) => {
  db.prepare('INSERT OR IGNORE INTO plan_categories (user_id, name) VALUES (?,?)').run(req.user.userId, req.body.name)
  res.json(getAll(req.user.userId))
})

router.delete('/categories/:name', (req, res) => {
  db.prepare('DELETE FROM plan_categories WHERE user_id = ? AND name = ?').run(req.user.userId, req.params.name)
  res.json(getAll(req.user.userId))
})

router.put('/settings', (req, res) => {
  db.prepare('INSERT OR REPLACE INTO plan_settings (user_id, remind_interval) VALUES (?,?)').run(req.user.userId, req.body.remindInterval ?? 30)
  res.json(getAll(req.user.userId))
})

export default router
