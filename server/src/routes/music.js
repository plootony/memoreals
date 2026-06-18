import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import multer from 'multer'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { unlink } from 'fs/promises'
import { requireAuth } from '../middleware/auth.js'
import { getUserData, setUserData } from '../db/userStore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = join(__dirname, '../../uploads')

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => cb(null, `${uuidv4()}_${file.originalname}`)
})
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'audio/mpeg' || file.mimetype === 'audio/mp3')
})

const router = Router()
router.use(requireAuth)

router.get('/tracks', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    res.json(data.tracks)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/tracks', upload.single('file'), async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  if (!req.file) return res.status(400).json({ error: 'MP3 file required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const track = {
      id: uuidv4(),
      title: req.body.title || req.file.originalname.replace('.mp3', ''),
      artist: req.body.artist || '',
      filename: req.file.filename,
      size: req.file.size,
      uploadedAt: new Date().toISOString()
    }
    data.tracks.push(track)
    await setUserData(req.user.userId, codeword, data)
    res.json(track)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/tracks/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const idx = data.tracks.findIndex(t => t.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    const { title, artist, cover } = req.body
    if (title !== undefined) data.tracks[idx].title = title
    if (artist !== undefined) data.tracks[idx].artist = artist
    if (cover !== undefined) data.tracks[idx].cover = cover
    await setUserData(req.user.userId, codeword, data)
    res.json(data.tracks[idx])
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/tracks/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const track = data.tracks.find(t => t.id === req.params.id)
    if (!track) return res.status(404).json({ error: 'Not found' })
    data.tracks = data.tracks.filter(t => t.id !== req.params.id)
    data.playlists = data.playlists.map(p => ({
      ...p, trackIds: p.trackIds.filter(id => id !== req.params.id)
    }))
    await setUserData(req.user.userId, codeword, data)
    try { await unlink(join(UPLOADS_DIR, track.filename)) } catch {}
    res.json({ ok: true })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.get('/playlists', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    res.json(data.playlists)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/playlists', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const playlist = { id: uuidv4(), name: req.body.name, trackIds: req.body.trackIds || [], createdAt: new Date().toISOString() }
    data.playlists.push(playlist)
    await setUserData(req.user.userId, codeword, data)
    res.json(playlist)
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.put('/playlists/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    const idx = data.playlists.findIndex(p => p.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Not found' })
    data.playlists[idx] = { ...data.playlists[idx], ...req.body }
    await setUserData(req.user.userId, codeword, data)
    res.json(data.playlists[idx])
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

router.delete('/playlists/:id', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword header required' })
  try {
    const data = await getUserData(req.user.userId, codeword)
    data.playlists = data.playlists.filter(p => p.id !== req.params.id)
    await setUserData(req.user.userId, codeword, data)
    res.json({ ok: true })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

export default router
