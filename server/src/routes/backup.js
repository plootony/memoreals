import { Router } from 'express'
import { exec } from 'child_process'
import { promisify } from 'util'
import { createWriteStream, renameSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  S3Client, ListObjectsV2Command,
  PutObjectCommand, GetObjectCommand, DeleteObjectCommand
} from '@aws-sdk/client-s3'
import { requireAuth } from '../middleware/auth.js'
import db from '../db/sqlite.js'

const execAsync = promisify(exec)
const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH   = join(__dirname, '../../data/db.sqlite')
const TMP_PATH  = join(__dirname, '../../data/.restore_tmp.sqlite')
const PREFIX    = 'backups/'

const router = Router()
router.use(requireAuth)

function r2() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

// GET /api/backup — список бэкапов из R2
router.get('/', async (req, res) => {
  try {
    const list = await r2().send(new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET,
      Prefix: PREFIX,
    }))
    const backups = (list.Contents || [])
      .sort((a, b) => b.Key.localeCompare(a.Key)) // новые первые
      .map(o => ({
        key:  o.Key,
        name: o.Key.replace(PREFIX, ''),
        size: o.Size,
        date: o.LastModified,
      }))
    res.json(backups)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/backup/create — создать бэкап прямо сейчас
router.post('/create', async (req, res) => {
  try {
    const TMP = join(__dirname, '../../data/.backup_now.sqlite')
    await db.backup(TMP)

    const { readFileSync, unlinkSync } = await import('fs')
    const date = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
    const key  = `${PREFIX}db_${date}.sqlite`

    await r2().send(new PutObjectCommand({
      Bucket:      process.env.R2_BUCKET,
      Key:         key,
      Body:        readFileSync(TMP),
      ContentType: 'application/octet-stream',
    }))
    unlinkSync(TMP)

    res.json({ ok: true, key })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/backup/restore — восстановить из R2
router.post('/restore', async (req, res) => {
  const { key } = req.body
  if (!key?.startsWith(PREFIX)) return res.status(400).json({ error: 'Invalid key' })

  try {
    // 1. Скачиваем из R2
    const obj = await r2().send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key:    key,
    }))

    // 2. Пишем во временный файл
    await new Promise((resolve, reject) => {
      const ws = createWriteStream(TMP_PATH)
      obj.Body.pipe(ws)
      ws.on('finish', resolve)
      ws.on('error', reject)
    })

    // 3. Атомарно заменяем db.sqlite (Linux: rename на том же FS = атомарно)
    renameSync(TMP_PATH, DB_PATH)

    // 4. Перезапускаем PM2 чтобы новый процесс открыл новый файл
    res.json({ ok: true })
    setTimeout(() => execAsync('pm2 restart memoreals').catch(() => {}), 200)

  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE /api/backup/:key — удалить бэкап
router.delete('/', async (req, res) => {
  const { key } = req.body
  if (!key?.startsWith(PREFIX)) return res.status(400).json({ error: 'Invalid key' })
  try {
    await r2().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }))
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
