import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'
import { uploadToR2, deleteFromR2 } from '../services/r2.js'
import db from '../db/sqlite.js'
import { ensureJournalAlbum } from './gallery.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
})

const router = Router()
router.use(requireAuth)

router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file' })
  try {
    const filename = `img_${uuidv4()}.webp`
    const isCover = req.query.type === 'cover'
    const isJournal = req.query.source === 'journal'
    const transform = sharp(req.file.buffer)

    if (isCover) {
      transform.resize(400, 400, { fit: 'cover' })
    } else {
      transform.resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    }

    const buffer = await transform.webp({ quality: 82 }).toBuffer()
    const url = await uploadToR2(buffer, filename)

    // Фото из дневника автоматически попадают в альбом "Дневник"
    if (isJournal) {
      const album = ensureJournalAlbum(req.user.userId)
      db.prepare('INSERT INTO photos (id, user_id, album_id, url, note, created_at) VALUES (?,?,?,?,?,?)')
        .run(uuidv4(), req.user.userId, album.id, url, '', new Date().toISOString())
    }

    res.json({ url })
  } catch (e) {
    console.error('Image upload error:', e.message)
    res.status(500).json({ error: 'Image upload failed' })
  }
})

router.delete('/:filename', async (req, res) => {
  await deleteFromR2(req.params.filename)
  res.json({ ok: true })
})

export default router
