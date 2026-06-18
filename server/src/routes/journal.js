import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import { getUserData, setUserData } from '../db/userStore.js'

const router = Router()
router.use(requireAuth)

router.get('/', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    let entries = data.journal

    const { year, month, day, search } = req.query
    if (year) entries = entries.filter(e => new Date(e.date).getFullYear() === Number(year))
    if (month) entries = entries.filter(e => new Date(e.date).getMonth() + 1 === Number(month))
    if (day) entries = entries.filter(e => new Date(e.date).getDate() === Number(day))
    if (search) entries = entries.filter(e => e.title?.toLowerCase().includes(search.toLowerCase()) || e.content?.toLowerCase().includes(search.toLowerCase()))

    entries = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date))
    res.json(entries)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const entry = {
      id: uuidv4(),
      title: req.body.title || '',
      content: req.body.content || '',
      date: req.body.date || new Date().toISOString(),
      photos: req.body.photos || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    data.journal.push(entry)
    await setUserData(req.user.userId, codeword, data)
    res.json(entry)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const idx = data.journal.findIndex(e => e.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    data.journal[idx] = { ...data.journal[idx], ...req.body, updatedAt: new Date().toISOString() }
    await setUserData(req.user.userId, codeword, data)
    res.json(data.journal[idx])
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    data.journal = data.journal.filter(e => e.id !== req.params.id)
    await setUserData(req.user.userId, codeword, data)
    res.json({ ok: true })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

export default router
