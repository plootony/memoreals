import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import db from '../db/sqlite.js'
import { decryptField } from '../utils/fieldCrypto.js'

const router = Router()
router.use(requireAuth)

function strip(html) { return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() }

router.get('/', (req, res) => {
  const { codeword } = req.headers
  const { q } = req.query
  if (!q || q.length < 2) return res.json({ journal: [], plans: [], study: [], finance: [], wishlist: [] })
  const uid = req.user.userId
  const query = q.toLowerCase()

  try {
    const journal = db.prepare('SELECT id, title, date, content FROM journal WHERE user_id = ?').all(uid)
      .filter(r => r.title?.toLowerCase().includes(query) || strip(decryptField(r.content, codeword || '')).toLowerCase().includes(query))
      .slice(0, 5).map(r => ({ id: r.id, title: r.title || 'Без названия', subtitle: r.date, section: 'journal' }))

    const plans = db.prepare("SELECT id, title, description, category, priority FROM tasks WHERE user_id = ? AND status != 'done'").all(uid)
      .filter(r => r.title.toLowerCase().includes(query) || r.description?.toLowerCase().includes(query))
      .slice(0, 5).map(r => ({ id: r.id, title: r.title, subtitle: r.category || r.priority, section: 'plans' }))

    const topicsRaw = db.prepare('SELECT * FROM study_topics WHERE user_id = ?').all(uid)
    const study = []
    for (const t of topicsRaw) {
      if (t.title.toLowerCase().includes(query)) study.push({ id: t.id, title: t.title, subtitle: 'Тема', section: 'study' })
      for (const ch of db.prepare('SELECT id, title, content FROM study_chapters WHERE topic_id = ?').all(t.id)) {
        const content = strip(decryptField(ch.content, codeword || ''))
        if (ch.title.toLowerCase().includes(query) || content.toLowerCase().includes(query))
          study.push({ id: ch.id, title: ch.title, subtitle: t.title, section: 'study' })
      }
      if (study.length >= 5) break
    }

    const finance = db.prepare('SELECT id, description, type, amount FROM transactions WHERE user_id = ? AND description LIKE ?').all(uid, `%${q}%`)
      .slice(0, 5).map(r => ({ id: r.id, title: r.description, subtitle: `${r.type === 'income' ? '+' : '−'}${r.amount} ₽`, section: 'finance' }))

    const wishlist = db.prepare('SELECT id, title, note, price, category FROM wishlist_items WHERE user_id = ? AND (title LIKE ? OR note LIKE ?)').all(uid, `%${q}%`, `%${q}%`)
      .slice(0, 5).map(r => ({ id: r.id, title: r.title, subtitle: r.price ? `${r.price.toLocaleString('ru')} ₽` : r.category, section: 'wishlist' }))

    res.json({ journal, plans, study: study.slice(0, 5), finance, wishlist })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

export default router
