import { Router } from 'express'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const VERSION_FILE = join(__dirname, '../../data/version.json')

const router = Router()

router.get('/', (req, res) => {
  try {
    res.json(JSON.parse(readFileSync(VERSION_FILE, 'utf8')))
  } catch {
    res.json({ version: '—', buildDate: null, commit: null })
  }
})

export default router
