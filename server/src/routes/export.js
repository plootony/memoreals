import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import db from '../db/sqlite.js'
import { decryptField } from '../utils/fieldCrypto.js'

const router = Router()
router.use(requireAuth)

router.get('/', (req, res) => {
  const { codeword } = req.headers
  if (!codeword) return res.status(400).json({ error: 'codeword required' })
  const uid = req.user.userId
  const user = db.prepare('SELECT username, created_at FROM users WHERE id = ?').get(uid)

  const journal = db.prepare('SELECT * FROM journal WHERE user_id = ? ORDER BY date').all(uid).map(r => ({
    id: r.id, title: r.title, content: decryptField(r.content, codeword), date: r.date,
    photos: JSON.parse(r.photos || '[]'), createdAt: r.created_at, updatedAt: r.updated_at
  }))

  const categories = db.prepare('SELECT * FROM finance_categories WHERE user_id = ?').all(uid).map(r => ({ id: r.id, name: r.name, color: r.color, icon: r.icon }))
  const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date').all(uid).map(r => ({ id: r.id, type: r.type, amount: r.amount, description: r.description, categoryId: r.category_id, date: r.date }))
  const debts = db.prepare('SELECT * FROM debts WHERE user_id = ?').all(uid).map(d => ({ id: d.id, name: d.name, totalAmount: d.total_amount, monthlyPayment: d.monthly_payment, direction: d.direction, note: d.note, dueDate: d.due_date, payments: db.prepare('SELECT * FROM debt_payments WHERE debt_id = ?').all(d.id) }))
  const cushion = db.prepare('SELECT * FROM cushion WHERE user_id = ?').get(uid) || { goal: 0 }
  const cushionContributions = db.prepare('SELECT * FROM cushion_contributions WHERE user_id = ?').all(uid)

  const tracks = db.prepare('SELECT * FROM music_tracks WHERE user_id = ?').all(uid).map(r => ({ id: r.id, title: r.title, artist: r.artist, filename: r.filename, cover: r.cover }))
  const playlists = db.prepare('SELECT * FROM music_playlists WHERE user_id = ?').all(uid).map(p => ({ id: p.id, name: p.name, trackIds: db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position').all(p.id).map(t => t.track_id) }))

  const dietProducts = db.prepare('SELECT * FROM diet_products WHERE user_id = ?').all(uid).map(r => ({ id: r.id, name: r.name, per100g: { calories: r.calories, protein: r.protein, fat: r.fat, carbs: r.carbs } }))
  const dietDishes = db.prepare('SELECT * FROM diet_dishes WHERE user_id = ?').all(uid).map(d => ({ id: d.id, name: d.name, totalGrams: d.total_grams, per100g: { calories: d.cal_per100, protein: d.protein_per100, fat: d.fat_per100, carbs: d.carbs_per100 }, ingredients: db.prepare('SELECT * FROM diet_dish_ingredients WHERE dish_id = ?').all(d.id).map(i => ({ productId: i.product_id, productName: i.product_name, grams: i.grams })) }))
  const dietLog = db.prepare('SELECT * FROM diet_log WHERE user_id = ? ORDER BY date').all(uid)
  const dietGoals = db.prepare('SELECT * FROM diet_goals WHERE user_id = ?').get(uid) || { calories: 2000, protein: 150, fat: 65, carbs: 250 }
  const weightLog = db.prepare('SELECT * FROM weight_log WHERE user_id = ? ORDER BY date').all(uid)
  const weightGoal = db.prepare('SELECT goal FROM weight_goals WHERE user_id = ?').get(uid)
  const bodyMeasurements = db.prepare('SELECT * FROM body_measurements WHERE user_id = ? ORDER BY date').all(uid)

  const studyTopics = db.prepare('SELECT * FROM study_topics WHERE user_id = ?').all(uid).map(t => ({ id: t.id, title: t.title, description: t.description, chapters: db.prepare('SELECT * FROM study_chapters WHERE topic_id = ? ORDER BY position').all(t.id).map(c => ({ id: c.id, title: c.title, content: decryptField(c.content, codeword), order: c.position })) }))

  const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at').all(uid)
  const planCategories = db.prepare('SELECT name FROM plan_categories WHERE user_id = ?').all(uid).map(r => r.name)
  const planSettings = db.prepare('SELECT * FROM plan_settings WHERE user_id = ?').get(uid) || { remind_interval: 30 }

  const wishlistItems = db.prepare('SELECT * FROM wishlist_items WHERE user_id = ?').all(uid)
  const wishlistCategories = db.prepare('SELECT name FROM wishlist_categories WHERE user_id = ?').all(uid).map(r => r.name)

  const exportData = {
    exportedAt: new Date().toISOString(),
    user: { username: user?.username, createdAt: user?.created_at },
    data: {
      journal, categories, transactions, debts,
      cushion: { goal: cushion.goal, contributions: cushionContributions },
      tracks, playlists, dietProducts, dietDishes, dietLog,
      dietGoals: { calories: dietGoals.calories, protein: dietGoals.protein, fat: dietGoals.fat, carbs: dietGoals.carbs },
      weightLog, weightGoal: weightGoal?.goal ?? null, bodyMeasurements,
      study: studyTopics,
      plans: { tasks, categories: planCategories, settings: { remindInterval: planSettings.remind_interval } },
      wishlist: { items: wishlistItems, categories: wishlistCategories },
    }
  }

  const filename = `memoreals-backup-${new Date().toISOString().slice(0, 10)}.json`
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify(exportData, null, 2))
})

export default router
