import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { unlink } from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = join(__dirname, '../../uploads')

// Принимаем в память, потом оптимизируем и пишем на диск
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB оригинал
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
})

const router = Router()
router.use(requireAuth)

router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file' })
  try {
    const filename = `img_${uuidv4()}.webp`
    const outPath = join(UPLOADS_DIR, filename)

    const isCover = req.query.type === 'cover'
    const transform = sharp(req.file.buffer)

    if (isCover) {
      // Обложки треков: квадрат 400×400
      transform.resize(400, 400, { fit: 'cover' })
    } else {
      // Фото в контенте: максимум Full HD
      transform.resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    }

    await transform.webp({ quality: 82 }).toFile(outPath)

    res.json({ url: `/uploads/${filename}` })
  } catch (e) {
    console.error('Image processing error:', e.message)
    res.status(500).json({ error: 'Image processing failed' })
  }
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
