import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import './db/sqlite.js' // initialises DB and runs schema on startup
import authRoutes from './routes/auth.js'
import journalRoutes from './routes/journal.js'
import financeRoutes from './routes/finance.js'
import musicRoutes from './routes/music.js'
import dietRoutes from './routes/diet.js'
import studyRoutes from './routes/study.js'
import settingsRoutes from './routes/settings.js'
import imagesRoutes from './routes/images.js'
import plansRoutes from './routes/plans.js'
import wishlistRoutes from './routes/wishlist.js'
import searchRoutes from './routes/search.js'
import exportRoutes from './routes/export.js'
import backupRoutes from './routes/backup.js'
import galleryRoutes from './routes/gallery.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001

const app = express()

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '2mb' }))
app.use('/uploads', express.static(join(__dirname, '../uploads')))

app.use('/api/auth', authRoutes)
app.use('/api/journal', journalRoutes)
app.use('/api/finance', financeRoutes)
app.use('/api/music', musicRoutes)
app.use('/api/diet', dietRoutes)
app.use('/api/study', studyRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/images', imagesRoutes)
app.use('/api/plans', plansRoutes)
app.use('/api/wishlist', wishlistRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/export', exportRoutes)
app.use('/api/backup', backupRoutes)
app.use('/api/gallery', galleryRoutes)

app.get('/api/health', (req, res) => res.json({ ok: true }))

if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '../../client/dist')
  app.use(express.static(distPath))
  app.get('*', (req, res) => res.sendFile(join(distPath, 'index.html')))
}

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://0.0.0.0:${PORT}`))
