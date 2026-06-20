import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import db from '../db/sqlite.js'

const router = Router()
router.use(requireAuth)

// ── Categories ────────────────────────────────────────────────────────────────
router.get('/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM finance_categories WHERE user_id = ?').all(req.user.userId))
})

router.post('/categories', (req, res) => {
  const cat = { id: uuidv4(), user_id: req.user.userId, name: req.body.name, color: req.body.color || '#6366f1', icon: req.body.icon || '📁' }
  db.prepare('INSERT INTO finance_categories (id, user_id, name, color, icon) VALUES (?,?,?,?,?)').run(cat.id, cat.user_id, cat.name, cat.color, cat.icon)
  res.json({ id: cat.id, name: cat.name, color: cat.color, icon: cat.icon })
})

router.delete('/categories/:id', (req, res) => {
  db.prepare('DELETE FROM finance_categories WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId)
  res.json({ ok: true })
})

// ── Transactions ──────────────────────────────────────────────────────────────
router.get('/transactions', (req, res) => {
  let rows = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC').all(req.user.userId)
  const { type, categoryId, year, month, search } = req.query
  if (type) rows = rows.filter(r => r.type === type)
  if (categoryId) rows = rows.filter(r => r.category_id === categoryId)
  if (year) rows = rows.filter(r => r.date.startsWith(year))
  if (month) rows = rows.filter(r => new Date(r.date).getMonth() + 1 === Number(month))
  if (search) rows = rows.filter(r => r.description?.toLowerCase().includes(search.toLowerCase()))
  res.json(rows.map(rowToTx))
})

router.post('/transactions', (req, res) => {
  const now = new Date().toISOString()
  const tx = { id: uuidv4(), user_id: req.user.userId, type: req.body.type, amount: Number(req.body.amount), description: req.body.description || '', category_id: req.body.categoryId || null, date: req.body.date || now, created_at: now }
  db.prepare('INSERT INTO transactions (id, user_id, type, amount, description, category_id, date, created_at) VALUES (?,?,?,?,?,?,?,?)').run(tx.id, tx.user_id, tx.type, tx.amount, tx.description, tx.category_id, tx.date, tx.created_at)
  res.json(rowToTx(tx))
})

router.put('/transactions/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
  if (!row) return res.status(404).json({ error: 'Not found' })
  const up = { type: req.body.type ?? row.type, amount: req.body.amount != null ? Number(req.body.amount) : row.amount, description: req.body.description ?? row.description, category_id: req.body.categoryId !== undefined ? (req.body.categoryId || null) : row.category_id, date: req.body.date ?? row.date }
  db.prepare('UPDATE transactions SET type=?, amount=?, description=?, category_id=?, date=? WHERE id=?').run(up.type, up.amount, up.description, up.category_id, up.date, row.id)
  res.json(rowToTx({ ...row, ...up }))
})

router.delete('/transactions/:id', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId)
  res.json({ ok: true })
})

function rowToTx(r) {
  return { id: r.id, type: r.type, amount: r.amount, description: r.description, categoryId: r.category_id, date: r.date, createdAt: r.created_at }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const uid = req.user.userId
  const { year, month } = req.query
  let rows = db.prepare('SELECT * FROM transactions WHERE user_id = ?').all(uid)
  if (year) rows = rows.filter(r => r.date.startsWith(year))
  if (month) rows = rows.filter(r => new Date(r.date).getMonth() + 1 === Number(month))

  const totalIncome = rows.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)
  const totalExpense = rows.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
  const cats = db.prepare('SELECT * FROM finance_categories WHERE user_id = ?').all(uid)
  const byCategory = cats.map(c => ({ id: c.id, name: c.name, color: c.color, icon: c.icon, total: rows.filter(r => r.category_id === c.id && r.type === 'expense').reduce((s, r) => s + r.amount, 0) })).filter(c => c.total > 0)

  const currentYear = year ? Number(year) : new Date().getFullYear()
  const allYear = db.prepare('SELECT * FROM transactions WHERE user_id = ? AND date LIKE ?').all(uid, `${currentYear}%`)
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const mRows = allYear.filter(r => new Date(r.date).getMonth() + 1 === m)
    return { month: m, income: mRows.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0), expense: mRows.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0) }
  })
  res.json({ totalIncome, totalExpense, balance: totalIncome - totalExpense, byCategory, monthly })
})

// ── Debts ─────────────────────────────────────────────────────────────────────
router.get('/debts', (req, res) => {
  const debts = db.prepare('SELECT * FROM debts WHERE user_id = ? ORDER BY created_at DESC').all(req.user.userId)
  res.json(debts.map(d => ({
    id: d.id, name: d.name, totalAmount: d.total_amount, monthlyPayment: d.monthly_payment, direction: d.direction, note: d.note, dueDate: d.due_date, createdAt: d.created_at,
    payments: db.prepare('SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY date').all(d.id).map(p => ({ id: p.id, amount: p.amount, note: p.note, date: p.date }))
  })))
})

router.post('/debts', (req, res) => {
  const now = new Date().toISOString()
  const d = { id: uuidv4(), user_id: req.user.userId, name: req.body.name, total_amount: Number(req.body.totalAmount), monthly_payment: req.body.monthlyPayment ? Number(req.body.monthlyPayment) : null, direction: req.body.direction, note: req.body.note || '', due_date: req.body.dueDate || null, created_at: now }
  db.prepare('INSERT INTO debts (id, user_id, name, total_amount, monthly_payment, direction, note, due_date, created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(d.id, d.user_id, d.name, d.total_amount, d.monthly_payment, d.direction, d.note, d.due_date, d.created_at)
  res.json({ id: d.id, name: d.name, totalAmount: d.total_amount, monthlyPayment: d.monthly_payment, direction: d.direction, note: d.note, dueDate: d.due_date, createdAt: d.created_at, payments: [] })
})

router.put('/debts/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
  if (!row) return res.status(404).json({ error: 'Not found' })
  const fields = ['name', 'total_amount', 'monthly_payment', 'direction', 'note', 'due_date']
  const map = { totalAmount: 'total_amount', monthlyPayment: 'monthly_payment', dueDate: 'due_date' }
  const up = { ...row }
  for (const [k, v] of Object.entries(req.body)) { const col = map[k] || k; if (fields.includes(col)) up[col] = v != null ? (col.endsWith('amount') || col === 'monthly_payment' ? Number(v) : v) : null }
  db.prepare('UPDATE debts SET name=?, total_amount=?, monthly_payment=?, direction=?, note=?, due_date=? WHERE id=?').run(up.name, up.total_amount, up.monthly_payment, up.direction, up.note, up.due_date, row.id)
  const payments = db.prepare('SELECT * FROM debt_payments WHERE debt_id = ?').all(row.id).map(p => ({ id: p.id, amount: p.amount, note: p.note, date: p.date }))
  res.json({ id: row.id, name: up.name, totalAmount: up.total_amount, monthlyPayment: up.monthly_payment, direction: up.direction, note: up.note, dueDate: up.due_date, createdAt: row.created_at, payments })
})

router.delete('/debts/:id', (req, res) => {
  db.prepare('DELETE FROM debt_payments WHERE debt_id = ?').run(req.params.id)
  db.prepare('DELETE FROM debts WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId)
  res.json({ ok: true })
})

router.post('/debts/:id/payments', (req, res) => {
  const debt = db.prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
  if (!debt) return res.status(404).json({ error: 'Not found' })
  const p = { id: uuidv4(), debt_id: debt.id, amount: Number(req.body.amount), note: req.body.note || '', date: req.body.date || new Date().toISOString().slice(0, 10) }
  db.prepare('INSERT INTO debt_payments (id, debt_id, amount, note, date) VALUES (?,?,?,?,?)').run(p.id, p.debt_id, p.amount, p.note, p.date)
  res.json({ id: p.id, amount: p.amount, note: p.note, date: p.date })
})

router.delete('/debts/:id/payments/:pid', (req, res) => {
  db.prepare('DELETE FROM debt_payments WHERE id = ? AND debt_id = ?').run(req.params.pid, req.params.id)
  res.json({ ok: true })
})

// ── Cushion ───────────────────────────────────────────────────────────────────
router.get('/cushion', (req, res) => {
  const row = db.prepare('SELECT * FROM cushion WHERE user_id = ?').get(req.user.userId)
  const contributions = db.prepare('SELECT * FROM cushion_contributions WHERE user_id = ? ORDER BY date').all(req.user.userId)
  res.json({ goal: row?.goal ?? 0, contributions: contributions.map(c => ({ id: c.id, amount: c.amount, note: c.note, date: c.date })) })
})

router.put('/cushion/goal', (req, res) => {
  db.prepare('INSERT OR REPLACE INTO cushion (user_id, goal) VALUES (?,?)').run(req.user.userId, Number(req.body.goal) || 0)
  res.json({ ok: true })
})

router.post('/cushion/contributions', (req, res) => {
  const c = { id: uuidv4(), user_id: req.user.userId, amount: Number(req.body.amount), note: req.body.note || '', date: req.body.date || new Date().toISOString().slice(0, 10) }
  db.prepare('INSERT INTO cushion_contributions (id, user_id, amount, note, date) VALUES (?,?,?,?,?)').run(c.id, c.user_id, c.amount, c.note, c.date)
  res.json({ id: c.id, amount: c.amount, note: c.note, date: c.date })
})

router.delete('/cushion/contributions/:id', (req, res) => {
  db.prepare('DELETE FROM cushion_contributions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId)
  res.json({ ok: true })
})

export default router
