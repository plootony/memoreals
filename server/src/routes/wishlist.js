import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import { getUserData, setUserData } from '../db/userStore.js'

const router = Router()
router.use(requireAuth)

function getWishlist(data) {
  if (!data.wishlist) data.wishlist = { items: [], categories: ['Электроника', 'Одежда', 'Дом', 'Спорт', 'Другое'] }
  return data.wishlist
}

async function withData(req, res, fn) {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const result = await fn(data, getWishlist(data))
    await setUserData(req.user.userId, codeword, data)
    res.json(result)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
}

router.get('/', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    res.json(getWishlist(data))
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/items', (req, res) => withData(req, res, (data, wl) => {
  const item = {
    id: uuidv4(),
    title: req.body.title,
    category: req.body.category || '',
    url: req.body.url || null,
    price: req.body.price != null ? Number(req.body.price) : null,
    priority: req.body.priority || 'want',
    image: req.body.image || null,
    note: req.body.note || '',
    purchased: false,
    createdAt: new Date().toISOString(),
  }
  wl.items.push(item)
  return wl
}))

router.put('/items/:id', (req, res) => withData(req, res, (data, wl) => {
  const idx = wl.items.findIndex(i => i.id === req.params.id)
  if (idx === -1) throw new Error('Not found')
  wl.items[idx] = { ...wl.items[idx], ...req.body, id: wl.items[idx].id, createdAt: wl.items[idx].createdAt }
  return wl
}))

router.delete('/items/:id', (req, res) => withData(req, res, (data, wl) => {
  wl.items = wl.items.filter(i => i.id !== req.params.id)
  return wl
}))

router.put('/categories', (req, res) => withData(req, res, (data, wl) => {
  wl.categories = req.body.categories
  return wl
}))

export default router
