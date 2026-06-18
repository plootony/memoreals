import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import { getUserData, setUserData } from '../db/userStore.js'

const router = Router()
router.use(requireAuth)

// --- Topics ---

router.get('/topics', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    res.json((data.study || []).map(t => ({ ...t, chapters: t.chapters || [] })))
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/topics', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    if (!data.study) data.study = []
    const topic = {
      id: uuidv4(),
      title: req.body.title,
      description: req.body.description || '',
      chapters: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    data.study.push(topic)
    await setUserData(req.user.userId, codeword, data)
    res.json(topic)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/topics/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const idx = (data.study || []).findIndex(t => t.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    data.study[idx] = { ...data.study[idx], ...req.body, updatedAt: new Date().toISOString() }
    await setUserData(req.user.userId, codeword, data)
    res.json(data.study[idx])
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/topics/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    data.study = (data.study || []).filter(t => t.id !== req.params.id)
    await setUserData(req.user.userId, codeword, data)
    res.json({ ok: true })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

// --- Chapters ---

router.post('/topics/:id/chapters', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const topic = (data.study || []).find(t => t.id === req.params.id)
    if (!topic) return res.status(404).json({ error: 'Not found' })
    const chapter = {
      id: uuidv4(),
      title: req.body.title,
      content: req.body.content || '',
      order: topic.chapters.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    topic.chapters.push(chapter)
    topic.updatedAt = new Date().toISOString()
    await setUserData(req.user.userId, codeword, data)
    res.json(chapter)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/topics/:id/chapters/:chapterId', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const topic = (data.study || []).find(t => t.id === req.params.id)
    if (!topic) return res.status(404).json({ error: 'Not found' })
    const idx = topic.chapters.findIndex(c => c.id === req.params.chapterId)
    if (idx === -1) return res.status(404).json({ error: 'Chapter not found' })
    topic.chapters[idx] = { ...topic.chapters[idx], ...req.body, updatedAt: new Date().toISOString() }
    topic.updatedAt = new Date().toISOString()
    await setUserData(req.user.userId, codeword, data)
    res.json(topic.chapters[idx])
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/topics/:id/chapters/:chapterId', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const topic = (data.study || []).find(t => t.id === req.params.id)
    if (!topic) return res.status(404).json({ error: 'Not found' })
    topic.chapters = topic.chapters.filter(c => c.id !== req.params.chapterId)
    topic.updatedAt = new Date().toISOString()
    await setUserData(req.user.userId, codeword, data)
    res.json({ ok: true })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

export default router
