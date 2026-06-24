import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import multer from 'multer'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { unlink, readdir } from 'fs/promises'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import { requireAuth } from '../middleware/auth.js'
import { uploadToR2 } from '../services/r2.js'
import db from '../db/sqlite.js'

const execFile = promisify(execFileCb)

// Strict YouTube URL whitelist — prevents command injection
const YT_URL_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch\?.*v=[\w-]+|youtu\.be\/[\w-]+)/

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

function rowToTrack(r) {
  return { id: r.id, title: r.title, artist: r.artist, filename: r.filename, cover: r.cover, uploadedAt: r.uploaded_at }
}
function rowToPlaylist(r) {
  const trackIds = db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position').all(r.id).map(t => t.track_id)
  return { id: r.id, name: r.name, trackIds, createdAt: r.created_at }
}

// ── Tracks ────────────────────────────────────────────────────────────────────
router.get('/tracks', (req, res) => {
  res.json(db.prepare('SELECT * FROM music_tracks WHERE user_id = ? ORDER BY uploaded_at DESC').all(req.user.userId).map(rowToTrack))
})

router.post('/tracks', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'MP3 file required' })
  const track = { id: uuidv4(), user_id: req.user.userId, title: req.body.title || req.file.originalname.replace('.mp3', ''), artist: req.body.artist || '', filename: req.file.filename, cover: null, uploaded_at: new Date().toISOString() }
  db.prepare('INSERT INTO music_tracks (id, user_id, title, artist, filename, cover, uploaded_at) VALUES (?,?,?,?,?,?,?)').run(track.id, track.user_id, track.title, track.artist, track.filename, track.cover, track.uploaded_at)
  res.json(rowToTrack(track))
})

router.put('/tracks/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM music_tracks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
  if (!row) return res.status(404).json({ error: 'Not found' })
  const title = req.body.title ?? row.title
  const artist = req.body.artist ?? row.artist
  const cover = req.body.cover !== undefined ? req.body.cover : row.cover
  db.prepare('UPDATE music_tracks SET title=?, artist=?, cover=? WHERE id=?').run(title, artist, cover, row.id)
  res.json(rowToTrack({ ...row, title, artist, cover }))
})

router.delete('/tracks/:id', async (req, res) => {
  const row = db.prepare('SELECT * FROM music_tracks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
  if (!row) return res.status(404).json({ error: 'Not found' })
  db.prepare('DELETE FROM playlist_tracks WHERE track_id = ?').run(row.id)
  db.prepare('DELETE FROM music_tracks WHERE id = ?').run(row.id)
  try { await unlink(join(UPLOADS_DIR, row.filename)) } catch {}
  res.json({ ok: true })
})

// ── Playlists ─────────────────────────────────────────────────────────────────
router.get('/playlists', (req, res) => {
  res.json(db.prepare('SELECT * FROM music_playlists WHERE user_id = ? ORDER BY created_at').all(req.user.userId).map(rowToPlaylist))
})

router.post('/playlists', (req, res) => {
  const p = { id: uuidv4(), user_id: req.user.userId, name: req.body.name, created_at: new Date().toISOString() }
  db.prepare('INSERT INTO music_playlists (id, user_id, name, created_at) VALUES (?,?,?,?)').run(p.id, p.user_id, p.name, p.created_at)
  res.json(rowToPlaylist(p))
})

router.put('/playlists/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM music_playlists WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId)
  if (!row) return res.status(404).json({ error: 'Not found' })
  if (req.body.name != null) db.prepare('UPDATE music_playlists SET name=? WHERE id=?').run(req.body.name, row.id)
  if (req.body.trackIds != null) {
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(row.id)
    const ins = db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?,?,?)')
    req.body.trackIds.forEach((tid, i) => ins.run(row.id, tid, i))
  }
  res.json(rowToPlaylist({ ...row, name: req.body.name ?? row.name }))
})

router.delete('/playlists/:id', (req, res) => {
  db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(req.params.id)
  db.prepare('DELETE FROM music_playlists WHERE id = ? AND user_id = ?').run(req.params.id, req.user.userId)
  res.json({ ok: true })
})

// ── YouTube → MP3 (async job) ─────────────────────────────────────────────────
const ytJobs = new Map() // jobId → { status, track, error }

router.post('/youtube', async (req, res) => {
  const { url } = req.body
  if (!url || !YT_URL_RE.test(url)) return res.status(400).json({ error: 'Invalid YouTube URL' })

  const jobId = uuidv4()
  ytJobs.set(jobId, { status: 'pending' })
  res.json({ jobId })

  // Run download in background
  ;(async () => {
    try {
      // Use execFile (args as array) — no shell, no injection possible
      const { stdout: infoJson } = await execFile(
        'yt-dlp', ['--dump-json', '--no-playlist', url],
        { timeout: 60000 }
      )
      const info   = JSON.parse(infoJson)
      const title  = (info.title || 'Unknown').slice(0, 200)
      const artist = (info.uploader || info.channel || '').slice(0, 100)

      const filename = `${uuidv4()}.mp3`
      const outPath  = join(UPLOADS_DIR, filename)

      await execFile(
        'yt-dlp', ['--no-playlist', '-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', outPath, url],
        { timeout: 600000 }
      )

      // Download best thumbnail and upload to R2
      let coverUrl = null
      const thumbUrl = info.thumbnail
        || (info.thumbnails?.sort((a, b) => (b.width || 0) - (a.width || 0))?.[0]?.url)
      if (thumbUrl) {
        try {
          const resp = await fetch(thumbUrl)
          const buf  = Buffer.from(await resp.arrayBuffer())
          const ext  = thumbUrl.includes('.webp') ? 'webp' : 'jpg'
          coverUrl   = await uploadToR2(buf, `cover_${uuidv4()}.${ext}`, `image/${ext}`)
        } catch (e) {
          console.warn('Thumbnail upload failed:', e.message)
        }
      }

      const track = {
        id: uuidv4(),
        user_id: req.user.userId,
        title, artist, filename,
        cover: coverUrl,
        uploaded_at: new Date().toISOString(),
      }
      db.prepare('INSERT INTO music_tracks (id, user_id, title, artist, filename, cover, uploaded_at) VALUES (?,?,?,?,?,?,?)')
        .run(track.id, track.user_id, track.title, track.artist, track.filename, track.cover, track.uploaded_at)

      ytJobs.set(jobId, { status: 'done', track: { id: track.id, title, artist, filename, cover: track.cover } })
    } catch (e) {
      console.error('yt-dlp error:', e.message)
      ytJobs.set(jobId, { status: 'error', error: 'Не удалось скачать. Видео может быть недоступно или защищено.' })
    }
    // Clean up job after 10 min
    setTimeout(() => ytJobs.delete(jobId), 600000)
  })()
})

router.get('/youtube/:jobId', (req, res) => {
  const job = ytJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  res.json(job)
})

export default router
