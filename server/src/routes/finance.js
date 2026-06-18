import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import { getUserData, setUserData } from '../db/userStore.js'

const router = Router()
router.use(requireAuth)

// --- Categories ---
router.get('/categories', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    res.json(data.categories)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/categories', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const cat = { id: uuidv4(), name: req.body.name, color: req.body.color || '#6366f1', icon: req.body.icon || '📁' }
    data.categories.push(cat)
    await setUserData(req.user.userId, codeword, data)
    res.json(cat)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/categories/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    data.categories = data.categories.filter(c => c.id !== req.params.id)
    await setUserData(req.user.userId, codeword, data)
    res.json({ ok: true })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

// --- Transactions ---
router.get('/transactions', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    let txs = data.transactions

    const { type, categoryId, year, month, search } = req.query
    if (type) txs = txs.filter(t => t.type === type)
    if (categoryId) txs = txs.filter(t => t.categoryId === categoryId)
    if (year) txs = txs.filter(t => new Date(t.date).getFullYear() === Number(year))
    if (month) txs = txs.filter(t => new Date(t.date).getMonth() + 1 === Number(month))
    if (search) txs = txs.filter(t => t.description?.toLowerCase().includes(search.toLowerCase()))

    txs = [...txs].sort((a, b) => new Date(b.date) - new Date(a.date))
    res.json(txs)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/transactions', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const tx = {
      id: uuidv4(),
      type: req.body.type, // 'income' | 'expense'
      amount: Number(req.body.amount),
      description: req.body.description || '',
      categoryId: req.body.categoryId || null,
      date: req.body.date || new Date().toISOString(),
      createdAt: new Date().toISOString()
    }
    data.transactions.push(tx)
    await setUserData(req.user.userId, codeword, data)
    res.json(tx)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/transactions/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const idx = data.transactions.findIndex(t => t.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    data.transactions[idx] = { ...data.transactions[idx], ...req.body }
    await setUserData(req.user.userId, codeword, data)
    res.json(data.transactions[idx])
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/transactions/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    data.transactions = data.transactions.filter(t => t.id !== req.params.id)
    await setUserData(req.user.userId, codeword, data)
    res.json({ ok: true })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

// --- Dashboard stats ---
router.get('/stats', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const { year, month } = req.query
    let txs = data.transactions
    if (year) txs = txs.filter(t => new Date(t.date).getFullYear() === Number(year))
    if (month) txs = txs.filter(t => new Date(t.date).getMonth() + 1 === Number(month))

    const totalIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const totalExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

    const byCategory = data.categories.map(cat => ({
      ...cat,
      total: txs.filter(t => t.categoryId === cat.id && t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    })).filter(c => c.total > 0)

    // monthly chart for current year
    const currentYear = year ? Number(year) : new Date().getFullYear()
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const mTxs = data.transactions.filter(t => {
        const d = new Date(t.date)
        return d.getFullYear() === currentYear && d.getMonth() + 1 === m
      })
      return {
        month: m,
        income: mTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        expense: mTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      }
    })

    res.json({ totalIncome, totalExpense, balance: totalIncome - totalExpense, byCategory, monthly })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

// --- Debts ---

router.get('/debts', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    res.json(data.debts || [])
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/debts', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    if (!data.debts) data.debts = []
    const debt = {
      id: uuidv4(),
      name: req.body.name,
      totalAmount: Number(req.body.totalAmount),
      monthlyPayment: req.body.monthlyPayment ? Number(req.body.monthlyPayment) : null,
      direction: req.body.direction || 'owe',
      note: req.body.note || '',
      dueDate: req.body.dueDate || null,
      payments: [],
      createdAt: new Date().toISOString()
    }
    data.debts.push(debt)
    await setUserData(req.user.userId, codeword, data)
    res.json(debt)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/debts/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const idx = (data.debts || []).findIndex(d => d.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    const allowed = ['name', 'totalAmount', 'monthlyPayment', 'direction', 'note', 'dueDate']
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        data.debts[idx][key] = ['totalAmount', 'monthlyPayment'].includes(key)
          ? (req.body[key] === '' || req.body[key] === null ? null : Number(req.body[key]))
          : req.body[key]
      }
    }
    await setUserData(req.user.userId, codeword, data)
    res.json(data.debts[idx])
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/debts/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    data.debts = (data.debts || []).filter(d => d.id !== req.params.id)
    await setUserData(req.user.userId, codeword, data)
    res.json({ ok: true })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

// Добавить платёж по долгу
router.post('/debts/:id/payments', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const debt = (data.debts || []).find(d => d.id === req.params.id)
    if (!debt) return res.status(404).json({ error: 'Not found' })
    const payment = {
      id: uuidv4(),
      amount: Number(req.body.amount),
      note: req.body.note || '',
      date: req.body.date || new Date().toISOString().slice(0, 10)
    }
    debt.payments.push(payment)
    await setUserData(req.user.userId, codeword, data)
    res.json(debt)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/debts/:id/payments/:paymentId', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const debt = (data.debts || []).find(d => d.id === req.params.id)
    if (!debt) return res.status(404).json({ error: 'Not found' })
    debt.payments = debt.payments.filter(p => p.id !== req.params.paymentId)
    await setUserData(req.user.userId, codeword, data)
    res.json(debt)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

// --- Копилка ---
router.get('/cushion', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    res.json(data.cushion || { goal: 0, contributions: [] })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/cushion/goal', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    if (!data.cushion) data.cushion = { goal: 0, contributions: [] }
    data.cushion.goal = Number(req.body.goal) || 0
    await setUserData(req.user.userId, codeword, data)
    res.json(data.cushion)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/cushion/contributions', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    if (!data.cushion) data.cushion = { goal: 0, contributions: [] }
    const entry = {
      id: uuidv4(),
      amount: Number(req.body.amount),
      note: req.body.note || '',
      date: req.body.date || new Date().toISOString().slice(0, 10),
    }
    data.cushion.contributions.push(entry)
    await setUserData(req.user.userId, codeword, data)
    res.json(data.cushion)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/cushion/contributions/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    if (!data.cushion) data.cushion = { goal: 0, contributions: [] }
    data.cushion.contributions = data.cushion.contributions.filter(c => c.id !== req.params.id)
    await setUserData(req.user.userId, codeword, data)
    res.json(data.cushion)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

export default router
