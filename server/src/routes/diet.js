import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import db from '../db/sqlite.js'

const router = Router()
router.use(requireAuth)

// ── Products ──────────────────────────────────────────────────────────────────
router.get('/products', (req, res) => {
  res.json(db.prepare('SELECT * FROM diet_products WHERE user_id = ? ORDER BY name').all(req.user.userId).map(rowToProd))
})

router.post('/products', (req, res) => {
  const p = { id: uuidv4(), user_id: req.user.userId, name: req.body.name, ...req.body.per100g, created_at: new Date().toISOString() }
  db.prepare('INSERT INTO diet_products (id, user_id, name, calories, protein, fat, carbs, created_at) VALUES (?,?,?,?,?,?,?,?)').run(p.id, p.user_id, p.name, p.calories, p.protein, p.fat, p.carbs, p.created_at)
  res.json(rowToProd(p))
})

router.put('/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM diet_products WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
  if (!row) return res.status(404).json({ error: 'Not found' })
  const up = { name: req.body.name ?? row.name, ...req.body.per100g }
  db.prepare('UPDATE diet_products SET name=?, calories=?, protein=?, fat=?, carbs=? WHERE id=?').run(up.name, up.calories ?? row.calories, up.protein ?? row.protein, up.fat ?? row.fat, up.carbs ?? row.carbs, row.id)
  res.json(rowToProd({ ...row, ...up }))
})

router.delete('/products/:id', (req, res) => {
  db.prepare('DELETE FROM diet_products WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId)
  res.json({ ok: true })
})

function rowToProd(r) {
  return { id: r.id, name: r.name, per100g: { calories: r.calories, protein: r.protein, fat: r.fat, carbs: r.carbs }, createdAt: r.created_at }
}

// ── Dishes ────────────────────────────────────────────────────────────────────
router.get('/dishes', (req, res) => {
  res.json(db.prepare('SELECT * FROM diet_dishes WHERE user_id = ? ORDER BY name').all(req.user.userId).map(rowToDish))
})

router.post('/dishes', (req, res) => {
  const d = { id: uuidv4(), user_id: req.user.userId, name: req.body.name, total_grams: req.body.totalGrams || 100, cal_per100: req.body.per100g.calories, protein_per100: req.body.per100g.protein, fat_per100: req.body.per100g.fat, carbs_per100: req.body.per100g.carbs, created_at: new Date().toISOString() }
  db.prepare('INSERT INTO diet_dishes (id, user_id, name, total_grams, cal_per100, protein_per100, fat_per100, carbs_per100, created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(d.id, d.user_id, d.name, d.total_grams, d.cal_per100, d.protein_per100, d.fat_per100, d.carbs_per100, d.created_at)
  const insIng = db.prepare('INSERT INTO diet_dish_ingredients (dish_id, product_id, product_name, grams) VALUES (?,?,?,?)')
  for (const ing of req.body.ingredients || []) insIng.run(d.id, ing.productId, ing.productName, ing.grams)
  res.json(rowToDish(d))
})

router.put('/dishes/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM diet_dishes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
  if (!row) return res.status(404).json({ error: 'Not found' })
  const up = { name: req.body.name ?? row.name, total_grams: req.body.totalGrams ?? row.total_grams, cal_per100: req.body.per100g?.calories ?? row.cal_per100, protein_per100: req.body.per100g?.protein ?? row.protein_per100, fat_per100: req.body.per100g?.fat ?? row.fat_per100, carbs_per100: req.body.per100g?.carbs ?? row.carbs_per100 }
  db.prepare('UPDATE diet_dishes SET name=?, total_grams=?, cal_per100=?, protein_per100=?, fat_per100=?, carbs_per100=? WHERE id=?').run(up.name, up.total_grams, up.cal_per100, up.protein_per100, up.fat_per100, up.carbs_per100, row.id)
  if (req.body.ingredients) {
    db.prepare('DELETE FROM diet_dish_ingredients WHERE dish_id = ?').run(row.id)
    const ins = db.prepare('INSERT INTO diet_dish_ingredients (dish_id, product_id, product_name, grams) VALUES (?,?,?,?)')
    for (const ing of req.body.ingredients) ins.run(row.id, ing.productId, ing.productName, ing.grams)
  }
  res.json(rowToDish({ ...row, ...up }))
})

router.delete('/dishes/:id', (req, res) => {
  db.prepare('DELETE FROM diet_dish_ingredients WHERE dish_id = ?').run(req.params.id)
  db.prepare('DELETE FROM diet_dishes WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId)
  res.json({ ok: true })
})

function rowToDish(r) {
  const ingredients = db.prepare('SELECT * FROM diet_dish_ingredients WHERE dish_id = ?').all(r.id).map(i => ({ productId: i.product_id, productName: i.product_name, grams: i.grams }))
  return { id: r.id, name: r.name, totalGrams: r.total_grams, per100g: { calories: r.cal_per100, protein: r.protein_per100, fat: r.fat_per100, carbs: r.carbs_per100 }, ingredients, createdAt: r.created_at }
}

// ── Log ───────────────────────────────────────────────────────────────────────
router.get('/log', (req, res) => {
  const { date } = req.query
  const rows = date
    ? db.prepare('SELECT * FROM diet_log WHERE user_id = ? AND date = ? ORDER BY created_at').all(req.user.userId, date)
    : db.prepare('SELECT * FROM diet_log WHERE user_id = ? ORDER BY date DESC, created_at DESC').all(req.user.userId)
  res.json(rows.map(rowToLog))
})

router.post('/log', (req, res) => {
  const { name, grams, per100g, date, meal } = req.body
  const f = Number(grams) / 100
  const now = new Date().toISOString()
  const entry = { id: uuidv4(), user_id: req.user.userId, name, grams: Number(grams), meal: meal || 'other', date: date || now.slice(0, 10), calories: Math.round((per100g.calories || 0) * f), protein: Math.round((per100g.protein || 0) * f * 10) / 10, fat: Math.round((per100g.fat || 0) * f * 10) / 10, carbs: Math.round((per100g.carbs || 0) * f * 10) / 10, created_at: now }
  db.prepare('INSERT INTO diet_log (id, user_id, name, grams, meal, date, calories, protein, fat, carbs, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(entry.id, entry.user_id, entry.name, entry.grams, entry.meal, entry.date, entry.calories, entry.protein, entry.fat, entry.carbs, entry.created_at)
  res.json(rowToLog(entry))
})

router.delete('/log/:id', (req, res) => {
  db.prepare('DELETE FROM diet_log WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId)
  res.json({ ok: true })
})

function rowToLog(r) {
  return { id: r.id, name: r.name, grams: r.grams, meal: r.meal, date: r.date, calories: r.calories, protein: r.protein, fat: r.fat, carbs: r.carbs }
}

// ── Goals ─────────────────────────────────────────────────────────────────────
router.get('/goals', (req, res) => {
  const row = db.prepare('SELECT * FROM diet_goals WHERE user_id = ?').get(req.user.userId)
  res.json(row ? { calories: row.calories, protein: row.protein, fat: row.fat, carbs: row.carbs } : { calories: 2000, protein: 150, fat: 65, carbs: 250 })
})

router.put('/goals', (req, res) => {
  const cur = db.prepare('SELECT * FROM diet_goals WHERE user_id = ?').get(req.user.userId) || { calories: 2000, protein: 150, fat: 65, carbs: 250 }
  const g = { calories: req.body.calories ?? cur.calories, protein: req.body.protein ?? cur.protein, fat: req.body.fat ?? cur.fat, carbs: req.body.carbs ?? cur.carbs }
  db.prepare('INSERT OR REPLACE INTO diet_goals (user_id, calories, protein, fat, carbs) VALUES (?,?,?,?,?)').run(req.user.userId, g.calories, g.protein, g.fat, g.carbs)
  res.json(g)
})

// ── Weight ────────────────────────────────────────────────────────────────────
router.get('/weight', (req, res) => {
  const log = db.prepare('SELECT * FROM weight_log WHERE user_id = ? ORDER BY date').all(req.user.userId)
  const goal = db.prepare('SELECT goal FROM weight_goals WHERE user_id = ?').get(req.user.userId)
  res.json({ log: log.map(r => ({ id: r.id, date: r.date, weight: r.weight, note: r.note })), goal: goal?.goal ?? null })
})

router.post('/weight', (req, res) => {
  const date = req.body.date || new Date().toISOString().slice(0, 10)
  const existing = db.prepare('SELECT id FROM weight_log WHERE user_id = ? AND date = ?').get(req.user.userId, date)
  if (existing) db.prepare('DELETE FROM weight_log WHERE id = ?').run(existing.id)
  const entry = { id: uuidv4(), user_id: req.user.userId, date, weight: Number(req.body.weight), note: req.body.note || '' }
  db.prepare('INSERT INTO weight_log (id, user_id, date, weight, note) VALUES (?,?,?,?,?)').run(entry.id, entry.user_id, entry.date, entry.weight, entry.note)
  const log = db.prepare('SELECT * FROM weight_log WHERE user_id = ? ORDER BY date').all(req.user.userId)
  const goal = db.prepare('SELECT goal FROM weight_goals WHERE user_id = ?').get(req.user.userId)
  res.json({ log: log.map(r => ({ id: r.id, date: r.date, weight: r.weight, note: r.note })), goal: goal?.goal ?? null })
})

router.delete('/weight/:id', (req, res) => {
  db.prepare('DELETE FROM weight_log WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId)
  const log = db.prepare('SELECT * FROM weight_log WHERE user_id = ? ORDER BY date').all(req.user.userId)
  const goal = db.prepare('SELECT goal FROM weight_goals WHERE user_id = ?').get(req.user.userId)
  res.json({ log: log.map(r => ({ id: r.id, date: r.date, weight: r.weight, note: r.note })), goal: goal?.goal ?? null })
})

router.put('/weight/goal', (req, res) => {
  db.prepare('INSERT OR REPLACE INTO weight_goals (user_id, goal) VALUES (?,?)').run(req.user.userId, req.body.goal != null ? Number(req.body.goal) : null)
  const log = db.prepare('SELECT * FROM weight_log WHERE user_id = ? ORDER BY date').all(req.user.userId)
  const goal = db.prepare('SELECT goal FROM weight_goals WHERE user_id = ?').get(req.user.userId)
  res.json({ log: log.map(r => ({ id: r.id, date: r.date, weight: r.weight, note: r.note })), goal: goal?.goal ?? null })
})

// ── Body Measurements ─────────────────────────────────────────────────────────
router.get('/measurements', (req, res) => {
  const rows = db.prepare('SELECT * FROM body_measurements WHERE user_id = ? ORDER BY date').all(req.user.userId)
  res.json(rows.map(rowToMeas))
})

router.post('/measurements', (req, res) => {
  const v = req.body.values || {}
  const entry = { id: uuidv4(), user_id: req.user.userId, date: req.body.date || new Date().toISOString().slice(0, 10), waist: v.waist ?? null, chest: v.chest ?? null, hips: v.hips ?? null, left_arm: v.leftArm ?? null, right_arm: v.rightArm ?? null, left_thigh: v.leftThigh ?? null, right_thigh: v.rightThigh ?? null, neck: v.neck ?? null, note: req.body.note || '', created_at: new Date().toISOString() }
  db.prepare('INSERT INTO body_measurements (id, user_id, date, waist, chest, hips, left_arm, right_arm, left_thigh, right_thigh, neck, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(entry.id, entry.user_id, entry.date, entry.waist, entry.chest, entry.hips, entry.left_arm, entry.right_arm, entry.left_thigh, entry.right_thigh, entry.neck, entry.note, entry.created_at)
  res.json(db.prepare('SELECT * FROM body_measurements WHERE user_id = ? ORDER BY date').all(req.user.userId).map(rowToMeas))
})

router.delete('/measurements/:id', (req, res) => {
  db.prepare('DELETE FROM body_measurements WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId)
  res.json(db.prepare('SELECT * FROM body_measurements WHERE user_id = ? ORDER BY date').all(req.user.userId).map(rowToMeas))
})

function rowToMeas(r) {
  return { id: r.id, date: r.date, note: r.note, createdAt: r.created_at, values: { waist: r.waist, chest: r.chest, hips: r.hips, leftArm: r.left_arm, rightArm: r.right_arm, leftThigh: r.left_thigh, rightThigh: r.right_thigh, neck: r.neck } }
}

export default router
