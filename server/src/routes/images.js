import { Router } from 'express'
import multer from 'multer'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { unlink } from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = join(__dirname, '../../uploads')

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = file.mimetype.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
    cb(null, `img_${uuidv4()}.${ext}`)
  }
})
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
})

const router = Router()
router.use(requireAuth)

router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file' })
  res.json({ url: `/uploads/${req.file.filename}` })
})

router.delete('/:filename', async (req, res) => {
  try {
    await unlink(join(UPLOADS_DIR, req.params.filename))
    res.json({ ok: true })
  } catch {
    res.json({ ok: true }) // уже удалён — не критично
  }
})

export default router
