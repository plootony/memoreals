import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import { getUserData, setUserData } from '../db/userStore.js'

const router = Router()
router.use(requireAuth)

function getPlans(data) {
  if (!data.plans) data.plans = { tasks: [], categories: ['Работа', 'Личное', 'Учёба', 'Здоровье'], settings: { remindInterval: 30 } }
  return data.plans
}

async function withData(req, res, fn) {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const result = await fn(data, getPlans(data))
    await setUserData(req.user.userId, codeword, data)
    res.json(result)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
}

// Tasks
router.get('/tasks', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    res.json(getPlans(data))
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/tasks', (req, res) => withData(req, res, (data, plans) => {
  const task = {
    id: uuidv4(),
    title: req.body.title,
    description: req.body.description || '',
    category: req.body.category || '',
    priority: req.body.priority || 'medium',
    status: 'todo',
    deadline: req.body.deadline || null,
    remindBefore: req.body.remindBefore ?? null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  }
  plans.tasks.push(task)
  return plans
}))

router.put('/tasks/:id', (req, res) => withData(req, res, (data, plans) => {
  const idx = plans.tasks.findIndex(t => t.id === req.params.id)
  if (idx === -1) throw new Error('Not found')
  const prev = plans.tasks[idx]
  plans.tasks[idx] = {
    ...prev,
    ...req.body,
    id: prev.id,
    createdAt: prev.createdAt,
    completedAt: req.body.status === 'done' && prev.status !== 'done'
      ? new Date().toISOString()
      : req.body.status !== 'done' ? null : prev.completedAt,
  }
  return plans
}))

router.delete('/tasks/:id', (req, res) => withData(req, res, (data, plans) => {
  plans.tasks = plans.tasks.filter(t => t.id !== req.params.id)
  return plans
}))

// Categories
router.put('/categories', (req, res) => withData(req, res, (data, plans) => {
  plans.categories = req.body.categories
  return plans
}))

// Settings (remind interval)
router.put('/settings', (req, res) => withData(req, res, (data, plans) => {
  plans.settings = { ...plans.settings, ...req.body }
  return plans
}))

export default router
