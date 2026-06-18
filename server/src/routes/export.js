import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getUserData } from '../db/userStore.js'
import { authDb } from '../db/index.js'

const router = Router()
router.use(requireAuth)

router.get('/', async (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  try {
    await authDb.read()
    const user = authDb.data.users.find(u => u.id === req.user.userId)
    const data = await getUserData(req.user.userId, codeword)

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: { username: user?.username, createdAt: user?.createdAt },
      data,
    }

    const filename = `memoreals-backup-${new Date().toISOString().slice(0, 10)}.json`
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Type', 'application/json')
    res.send(JSON.stringify(exportData, null, 2))
  } catch (e) {
    if (e.message === 'DECRYPT_FAILED') return res.status(401).json({ error: 'Wrong codeword' })
    res.status(500).json({ error: e.message })
  }
})

export default router
