import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getUserData } from '../db/userStore.js'

const router = Router()
router.use(requireAuth)

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

router.get('/', async (req, res) => {
  const { codeword } = req.headers
  const { q } = req.query
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  if (!q || q.length < 2) return res.json({ journal: [], plans: [], study: [], finance: [] })

  try {
    const data = await getUserData(req.user.userId, codeword)
    const query = q.toLowerCase()

    const journal = (data.journal || [])
      .filter(e => e.title?.toLowerCase().includes(query) || stripHtml(e.content).toLowerCase().includes(query))
      .slice(0, 5)
      .map(e => ({ id: e.id, title: e.title || 'Без названия', subtitle: e.date, section: 'journal' }))

    const plans = (data.plans?.tasks || [])
      .filter(t => t.title.toLowerCase().includes(query) || t.description?.toLowerCase().includes(query))
      .slice(0, 5)
      .map(t => ({ id: t.id, title: t.title, subtitle: t.category || t.priority, section: 'plans' }))

    const study = (data.study || [])
      .flatMap(topic => {
        const results = []
        if (topic.title.toLowerCase().includes(query))
          results.push({ id: topic.id, title: topic.title, subtitle: 'Тема', section: 'study' })
        for (const ch of topic.chapters || []) {
          if (ch.title.toLowerCase().includes(query) || stripHtml(ch.content).toLowerCase().includes(query))
            results.push({ id: ch.id, title: ch.title, subtitle: topic.title, section: 'study' })
        }
        return results
      })
      .slice(0, 5)

    const finance = (data.transactions || [])
      .filter(t => t.description?.toLowerCase().includes(query))
      .slice(0, 5)
      .map(t => ({ id: t.id, title: t.description, subtitle: `${t.type === 'income' ? '+' : '−'}${t.amount} ₽`, section: 'finance' }))

    res.json({ journal, plans, study, finance })
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

export default router
