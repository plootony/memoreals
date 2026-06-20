import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import db from '../db/sqlite.js'

const router = Router()
router.use(requireAuth)

function getAll(userId) {
  const items = db.prepare('SELECT * FROM wishlist_items WHERE user_id = ? ORDER BY created_at DESC').all(userId).map(rowToItem)
  const categories = db.prepare('SELECT name FROM wishlist_categories WHERE user_id = ?').all(userId).map(r => r.name)
  return { items, categories }
}

function rowToItem(r) {
  return { id: r.id, title: r.title, category: r.category, url: r.url, price: r.price, priority: r.priority, image: r.image, note: r.note, purchased: !!r.purchased, createdAt: r.created_at }
}

router.get('/', (req, res) => res.json(getAll(req.user.userId)))

router.post('/items', (req, res) => {
  const item = { id: uuidv4(), user_id: req.user.userId, title: req.body.title, category: req.body.category || '', url: req.body.url || null, price: req.body.price != null ? Number(req.body.price) : null, priority: req.body.priority || 'want', image: req.body.image || null, note: req.body.note || '', purchased: 0, created_at: new Date().toISOString() }
  db.prepare('INSERT INTO wishlist_items (id, user_id, title, category, url, price, priority, image, note, purchased, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(item.id, item.user_id, item.title, item.category, item.url, item.price, item.priority, item.image, item.note, item.purchased, item.created_at)
  res.json(getAll(req.user.userId))
})

router.put('/items/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM wishlist_items WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
  if (!row) return res.status(404).json({ error: 'Not found' })
  const up = { title: req.body.title ?? row.title, category: req.body.category ?? row.category, url: req.body.url !== undefined ? (req.body.url || null) : row.url, price: req.body.price !== undefined ? (req.body.price != null ? Number(req.body.price) : null) : row.price, priority: req.body.priority ?? row.priority, image: req.body.image !== undefined ? req.body.image : row.image, note: req.body.note ?? row.note, purchased: req.body.purchased !== undefined ? (req.body.purchased ? 1 : 0) : row.purchased }
  db.prepare('UPDATE wishlist_items SET title=?, category=?, url=?, price=?, priority=?, image=?, note=?, purchased=? WHERE id=?').run(up.title, up.category, up.url, up.price, up.priority, up.image, up.note, up.purchased, row.id)
  res.json(getAll(req.user.userId))
})

router.delete('/items/:id', (req, res) => {
  db.prepare('DELETE FROM wishlist_items WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId)
  res.json(getAll(req.user.userId))
})

router.post('/categories', (req, res) => {
  db.prepare('INSERT OR IGNORE INTO wishlist_categories (user_id, name) VALUES (?,?)').run(req.user.userId, req.body.name)
  res.json(getAll(req.user.userId))
})

router.delete('/categories/:name', (req, res) => {
  db.prepare('DELETE FROM wishlist_categories WHERE user_id = ? AND name = ?').run(req.user.userId, req.params.name)
  res.json(getAll(req.user.userId))
})

export default router
