import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import { getUserData, setUserData } from '../db/userStore.js'

const router = Router()
router.use(requireAuth)

// ── Products ────────────────────────────────────────────────────────────────

router.get('/products', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    res.json(data.dietProducts || [])
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/products', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    if (!data.dietProducts) data.dietProducts = []
    const product = {
      id: uuidv4(),
      name: req.body.name,
      per100g: {
        calories: Number(req.body.per100g.calories) || 0,
        protein: Number(req.body.per100g.protein) || 0,
        fat: Number(req.body.per100g.fat) || 0,
        carbs: Number(req.body.per100g.carbs) || 0,
      },
      createdAt: new Date().toISOString()
    }
    data.dietProducts.push(product)
    await setUserData(req.user.userId, codeword, data)
    res.json(product)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/products/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const idx = (data.dietProducts || []).findIndex(p => p.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    data.dietProducts[idx] = { ...data.dietProducts[idx], ...req.body, id: req.params.id }
    await setUserData(req.user.userId, codeword, data)
    res.json(data.dietProducts[idx])
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/products/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    data.dietProducts = (data.dietProducts || []).filter(p => p.id !== req.params.id)
    await setUserData(req.user.userId, codeword, data)
    res.json({ ok: true })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

// ── Dishes ──────────────────────────────────────────────────────────────────

router.get('/dishes', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    res.json(data.dietDishes || [])
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/dishes', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    if (!data.dietDishes) data.dietDishes = []
    // ingredients: [{ productId, productName, grams }]
    // per100g calculated from ingredients
    const dish = {
      id: uuidv4(),
      name: req.body.name,
      ingredients: req.body.ingredients || [],
      per100g: req.body.per100g, // pre-calculated on client
      totalGrams: req.body.totalGrams || 100,
      createdAt: new Date().toISOString()
    }
    data.dietDishes.push(dish)
    await setUserData(req.user.userId, codeword, data)
    res.json(dish)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/dishes/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const idx = (data.dietDishes || []).findIndex(d => d.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    data.dietDishes[idx] = { ...data.dietDishes[idx], ...req.body, id: req.params.id }
    await setUserData(req.user.userId, codeword, data)
    res.json(data.dietDishes[idx])
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/dishes/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    data.dietDishes = (data.dietDishes || []).filter(d => d.id !== req.params.id)
    await setUserData(req.user.userId, codeword, data)
    res.json({ ok: true })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

// ── Log ─────────────────────────────────────────────────────────────────────

router.get('/log', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    let log = data.dietLog
    const { date } = req.query
    if (date) log = log.filter(e => e.date === date)
    res.json(log)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/log', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const { name, grams, per100g, date, meal } = req.body
    const factor = grams / 100
    const entry = {
      id: uuidv4(),
      name,
      grams: Number(grams),
      meal: meal || 'other',
      date: date || new Date().toISOString().slice(0, 10),
      calories: Math.round((per100g.calories || 0) * factor),
      protein: Math.round((per100g.protein || 0) * factor * 10) / 10,
      fat: Math.round((per100g.fat || 0) * factor * 10) / 10,
      carbs: Math.round((per100g.carbs || 0) * factor * 10) / 10,
      createdAt: new Date().toISOString()
    }
    data.dietLog.push(entry)
    await setUserData(req.user.userId, codeword, data)
    res.json(entry)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/log/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    data.dietLog = data.dietLog.filter(e => e.id !== req.params.id)
    await setUserData(req.user.userId, codeword, data)
    res.json({ ok: true })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

// ── Goals ───────────────────────────────────────────────────────────────────

router.get('/goals', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    res.json(data.dietGoals)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/goals', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    data.dietGoals = { ...data.dietGoals, ...req.body }
    await setUserData(req.user.userId, codeword, data)
    res.json(data.dietGoals)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

// ── Weight ───────────────────────────────────────────────────────────────────

router.get('/weight', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    res.json({ log: data.weightLog || [], goal: data.weightGoal ?? null })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/weight', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    if (!data.weightLog) data.weightLog = []
    const entry = {
      id: uuidv4(),
      date: req.body.date || new Date().toISOString().slice(0, 10),
      weight: Number(req.body.weight),
      note: req.body.note || '',
    }
    // Replace existing entry for the same date
    data.weightLog = data.weightLog.filter(e => e.date !== entry.date)
    data.weightLog.push(entry)
    data.weightLog.sort((a, b) => a.date.localeCompare(b.date))
    await setUserData(req.user.userId, codeword, data)
    res.json({ log: data.weightLog, goal: data.weightGoal ?? null })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/weight/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    data.weightLog = (data.weightLog || []).filter(e => e.id !== req.params.id)
    await setUserData(req.user.userId, codeword, data)
    res.json({ log: data.weightLog, goal: data.weightGoal ?? null })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/weight/goal', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    data.weightGoal = req.body.goal != null ? Number(req.body.goal) : null
    await setUserData(req.user.userId, codeword, data)
    res.json({ log: data.weightLog || [], goal: data.weightGoal })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

// ── Body Measurements ────────────────────────────────────────────────────────

router.get('/measurements', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    res.json(data.bodyMeasurements || [])
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/measurements', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    if (!data.bodyMeasurements) data.bodyMeasurements = []
    const entry = {
      id: uuidv4(),
      date: req.body.date || new Date().toISOString().slice(0, 10),
      values: req.body.values || {},
      note: req.body.note || '',
      createdAt: new Date().toISOString(),
    }
    data.bodyMeasurements.push(entry)
    data.bodyMeasurements.sort((a, b) => a.date.localeCompare(b.date))
    await setUserData(req.user.userId, codeword, data)
    res.json(data.bodyMeasurements)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/measurements/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    data.bodyMeasurements = (data.bodyMeasurements || []).filter(e => e.id !== req.params.id)
    await setUserData(req.user.userId, codeword, data)
    res.json(data.bodyMeasurements)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

export default router
