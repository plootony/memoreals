import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import multer from 'multer'
import sharp from 'sharp'
import { requireAuth } from '../middleware/auth.js'
import db from '../db/sqlite.js'
import { uploadToR2, deleteFromR2 } from '../services/r2.js'
import { decryptField } from '../utils/fieldCrypto.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
})

const router = Router()
router.use(requireAuth)

const JOURNAL_ALBUM_NAME = 'Дневник'

function ensureJournalAlbum(userId) {
  let album = db.prepare('SELECT * FROM photo_albums WHERE user_id = ? AND is_system = 1').get(userId)
  if (!album) {
    album = { id: uuidv4(), user_id: userId, name: JOURNAL_ALBUM_NAME, is_system: 1, created_at: new Date().toISOString() }
    db.prepare('INSERT INTO photo_albums (id, user_id, name, is_system, created_at) VALUES (?,?,?,?,?)').run(album.id, album.user_id, album.name, album.is_system, album.created_at)
  }
  return album
}

function rowToPhoto(r) {
  return { id: r.id, url: r.url, albumId: r.album_id, note: r.note, createdAt: r.created_at }
}

// GET /api/gallery — все фото, сгруппированные по альбомам
router.get('/', (req, res) => {
  const uid = req.user.userId
  const albums = db.prepare('SELECT * FROM photo_albums WHERE user_id = ? ORDER BY is_system DESC, created_at').all(uid)
  const photos = db.prepare('SELECT * FROM photos WHERE user_id = ? ORDER BY created_at DESC').all(uid)

  const albumsWithCover = albums.map(a => {
    const albumPhotos = photos.filter(p => p.album_id === a.id)
    // Cover: explicit cover_photo_id or first (oldest) photo in album
    const coverPhoto = a.cover_photo_id
      ? photos.find(p => p.id === a.cover_photo_id)
      : albumPhotos.at(-1)
    return {
      id: a.id,
      name: a.name,
      description: a.description || '',
      isSystem: !!a.is_system,
      count: albumPhotos.length,
      coverUrl: coverPhoto?.url || null,
    }
  })

  res.json({ albums: albumsWithCover, photos: photos.map(rowToPhoto) })
})

// POST /api/gallery — загрузить фото в галерею
router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file' })
  const uid = req.user.userId
  try {
    const filename = `gallery_${uuidv4()}.webp`
    const buffer = await sharp(req.file.buffer)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()
    const url = await uploadToR2(buffer, filename)

    // Определяем альбом: если указан albumId — используем его, иначе "Без категории"
    let albumId = req.body.albumId || null
    if (!albumId) {
      let nocat = db.prepare("SELECT id FROM photo_albums WHERE user_id = ? AND name = 'Без категории'").get(uid)
      if (!nocat) {
        nocat = { id: uuidv4() }
        db.prepare('INSERT INTO photo_albums (id, user_id, name, is_system, created_at) VALUES (?,?,?,0,?)').run(nocat.id, uid, 'Без категории', new Date().toISOString())
      }
      albumId = nocat.id
    }

    const photo = { id: uuidv4(), user_id: uid, album_id: albumId, url, note: req.body.note || '', created_at: new Date().toISOString() }
    db.prepare('INSERT INTO photos (id, user_id, album_id, url, note, created_at) VALUES (?,?,?,?,?,?)').run(photo.id, photo.user_id, photo.album_id, photo.url, photo.note, photo.created_at)

    res.json(rowToPhoto(photo))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/gallery/:id — удалить фото (с проверкой использования в дневнике)
router.delete('/:id', (req, res) => {
  const uid = req.user.userId
  const { codeword } = req.headers
  const force = req.query.force === 'true'

  const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND user_id = ?').get(req.params.id, uid)
  if (!photo) return res.status(404).json({ error: 'Not found' })

  // Проверяем использование в дневнике (если не force)
  if (!force && codeword) {
    const entries = db.prepare('SELECT id, title, content FROM journal WHERE user_id = ?').all(uid)
    const usedIn = []
    for (const entry of entries) {
      try {
        const content = decryptField(entry.content, codeword)
        if (content.includes(photo.url)) {
          usedIn.push({ id: entry.id, title: entry.title || 'Без названия' })
        }
      } catch {}
    }
    if (usedIn.length > 0) {
      return res.status(409).json({ usedIn, message: `Фото используется в ${usedIn.length} ${usedIn.length === 1 ? 'записи' : 'записях'} дневника` })
    }
  }

  // Извлекаем имя файла из URL и удаляем из R2
  const filename = photo.url.split('/').pop()
  deleteFromR2(filename).catch(() => {})

  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id)
  res.json({ ok: true })
})

// PATCH /api/gallery/:id — перенести фото в другой альбом
router.patch('/:id', (req, res) => {
  const { albumId } = req.body
  if (!albumId) return res.status(400).json({ error: 'albumId required' })
  const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
  if (!photo) return res.status(404).json({ error: 'Not found' })
  db.prepare('UPDATE photos SET album_id = ? WHERE id = ?').run(albumId, photo.id)
  res.json({ ok: true })
})

// POST /api/gallery/albums — создать альбом
router.post('/albums', (req, res) => {
  const album = { id: uuidv4(), user_id: req.user.userId, name: req.body.name, is_system: 0, created_at: new Date().toISOString() }
  db.prepare('INSERT INTO photo_albums (id, user_id, name, is_system, created_at) VALUES (?,?,?,?,?)').run(album.id, album.user_id, album.name, album.is_system, album.created_at)
  res.json({ id: album.id, name: album.name, isSystem: false, count: 0 })
})

// PATCH /api/gallery/albums/:id — обновить альбом (name, description, cover_photo_id)
router.patch('/albums/:id', (req, res) => {
  const album = db.prepare('SELECT * FROM photo_albums WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
  if (!album) return res.status(404).json({ error: 'Not found' })
  if (req.body.name !== undefined && album.is_system) return res.status(403).json({ error: 'Cannot rename system album' })
  const name = req.body.name ?? album.name
  const description = req.body.description ?? album.description ?? ''
  const cover_photo_id = req.body.cover_photo_id !== undefined ? (req.body.cover_photo_id || null) : album.cover_photo_id
  db.prepare('UPDATE photo_albums SET name = ?, description = ?, cover_photo_id = ? WHERE id = ?').run(name, description, cover_photo_id, album.id)
  res.json({ ok: true })
})

// DELETE /api/gallery/albums/:id — удалить альбом (фото переносятся в "Без категории")
router.delete('/albums/:id', (req, res) => {
  const uid = req.user.userId
  const album = db.prepare('SELECT * FROM photo_albums WHERE id = ? AND user_id = ?').get(req.params.id, uid)
  if (!album) return res.status(404).json({ error: 'Not found' })
  if (album.is_system) return res.status(403).json({ error: 'Cannot delete system album' })

  const count = db.prepare('SELECT COUNT(*) as n FROM photos WHERE album_id = ?').get(album.id).n

  if (count > 0) {
    // Перемещаем фото в "Без категории"
    let nocat = db.prepare("SELECT id FROM photo_albums WHERE user_id = ? AND name = 'Без категории'").get(uid)
    if (!nocat) {
      nocat = { id: uuidv4() }
      db.prepare('INSERT INTO photo_albums (id, user_id, name, is_system, created_at) VALUES (?,?,?,0,?)').run(nocat.id, uid, 'Без категории', new Date().toISOString())
    }
    db.prepare('UPDATE photos SET album_id = ? WHERE album_id = ?').run(nocat.id, album.id)
  }

  db.prepare('DELETE FROM photo_albums WHERE id = ?').run(album.id)
  res.json({ ok: true, movedPhotos: count })
})

// Экспортируем хелпер для images.js
export { ensureJournalAlbum }
export default router
