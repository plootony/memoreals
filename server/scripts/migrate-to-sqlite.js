#!/usr/bin/env node
/**
 * One-time migration: auth.json + data.json (LowDB) → db.sqlite
 *
 * Usage:
 *   node scripts/migrate-to-sqlite.js --codeword="YOUR_CODEWORD"
 *
 * The script is idempotent: re-running it is safe (INSERT OR IGNORE).
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../data')

// ── Parse codeword arg ────────────────────────────────────────────────────────
const cwArg = process.argv.find(a => a.startsWith('--codeword='))
if (!cwArg) {
  console.error('Usage: node scripts/migrate-to-sqlite.js --codeword="YOUR_CODEWORD"')
  process.exit(1)
}
const CODEWORD = cwArg.replace('--codeword=', '')

// ── Import DB (creates schema if not exists) ─────────────────────────────────
const { default: db } = await import('../src/db/sqlite.js')
const { decrypt } = await import('../src/utils/crypto.js')
const { encryptField } = await import('../src/utils/fieldCrypto.js')

// ── Read JSON sources ─────────────────────────────────────────────────────────
const AUTH_PATH = join(DATA_DIR, 'auth.json')
const DATA_PATH = join(DATA_DIR, 'data.json')

if (!existsSync(AUTH_PATH)) { console.log('auth.json not found — skipping auth migration'); }
if (!existsSync(DATA_PATH)) { console.log('data.json not found — skipping data migration'); }

// ── Migrate auth ──────────────────────────────────────────────────────────────
if (existsSync(AUTH_PATH)) {
  const auth = JSON.parse(readFileSync(AUTH_PATH, 'utf8'))
  const ins = db.prepare(`
    INSERT OR IGNORE INTO users (id, username, password_hash, codeword_verifier, created_at)
    VALUES (@id, @username, @password_hash, @codeword_verifier, @created_at)
  `)
  let count = 0
  for (const u of auth.users || []) {
    ins.run({
      id: u.id,
      username: u.username,
      password_hash: u.passwordHash,
      codeword_verifier: u.codewordVerifier,
      created_at: u.createdAt,
    })
    count++
  }
  console.log(`✅ Users migrated: ${count}`)
}

// ── Migrate user data ─────────────────────────────────────────────────────────
if (!existsSync(DATA_PATH)) process.exit(0)

const dataFile = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
const entries = dataFile.entries || {}

for (const [userId, encrypted] of Object.entries(entries)) {
  console.log(`\n── Migrating user ${userId}`)
  let data
  try {
    data = JSON.parse(decrypt(encrypted, CODEWORD))
  } catch {
    console.error(`  ✗ Failed to decrypt — wrong codeword?`)
    continue
  }

  const now = new Date().toISOString()
  db.transaction(() => {

    // Journal
    const insJournal = db.prepare(`INSERT OR IGNORE INTO journal (id, user_id, title, content, date, photos, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`)
    let n = 0
    for (const e of data.journal || []) {
      insJournal.run(e.id, userId, e.title || '', encryptField(e.content || '', CODEWORD), e.date, JSON.stringify(e.photos || []), e.createdAt || now, e.updatedAt || now)
      n++
    }
    console.log(`  journal: ${n}`)

    // Finance categories
    const insCat = db.prepare(`INSERT OR IGNORE INTO finance_categories (id, user_id, name, color, icon) VALUES (?,?,?,?,?)`)
    n = 0
    for (const c of data.categories || []) {
      insCat.run(c.id, userId, c.name, c.color || '#6366f1', c.icon || '📁')
      n++
    }
    console.log(`  finance categories: ${n}`)

    // Transactions
    const insTx = db.prepare(`INSERT OR IGNORE INTO transactions (id, user_id, type, amount, description, category_id, date, created_at) VALUES (?,?,?,?,?,?,?,?)`)
    n = 0
    for (const t of data.transactions || []) {
      insTx.run(t.id, userId, t.type, t.amount, t.description || '', t.categoryId || null, t.date, t.createdAt || now)
      n++
    }
    console.log(`  transactions: ${n}`)

    // Debts
    const insDebt = db.prepare(`INSERT OR IGNORE INTO debts (id, user_id, name, total_amount, monthly_payment, direction, note, due_date, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    const insDebtPay = db.prepare(`INSERT OR IGNORE INTO debt_payments (id, debt_id, amount, note, date) VALUES (?,?,?,?,?)`)
    n = 0
    for (const d of data.debts || []) {
      insDebt.run(d.id, userId, d.name, d.totalAmount, d.monthlyPayment || null, d.direction, d.note || '', d.dueDate || null, d.createdAt || now)
      for (const p of d.payments || []) insDebtPay.run(p.id, d.id, p.amount, p.note || '', p.date)
      n++
    }
    console.log(`  debts: ${n}`)

    // Cushion
    const cushion = data.cushion || { goal: 0, contributions: [] }
    db.prepare(`INSERT OR REPLACE INTO cushion (user_id, goal) VALUES (?,?)`).run(userId, cushion.goal || 0)
    const insCush = db.prepare(`INSERT OR IGNORE INTO cushion_contributions (id, user_id, amount, note, date) VALUES (?,?,?,?,?)`)
    n = 0
    for (const c of cushion.contributions || []) {
      insCush.run(c.id, userId, c.amount, c.note || '', c.date)
      n++
    }
    console.log(`  cushion contributions: ${n}`)

    // Music tracks
    const insTrack = db.prepare(`INSERT OR IGNORE INTO music_tracks (id, user_id, title, artist, filename, cover, uploaded_at) VALUES (?,?,?,?,?,?,?)`)
    n = 0
    for (const t of data.tracks || []) {
      insTrack.run(t.id, userId, t.title, t.artist || '', t.filename, t.cover || null, t.uploadedAt || now)
      n++
    }
    console.log(`  tracks: ${n}`)

    // Playlists
    const insPl = db.prepare(`INSERT OR IGNORE INTO music_playlists (id, user_id, name, created_at) VALUES (?,?,?,?)`)
    const insPlTr = db.prepare(`INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?,?,?)`)
    n = 0
    for (const p of data.playlists || []) {
      insPl.run(p.id, userId, p.name, p.createdAt || now)
      ;(p.trackIds || []).forEach((tid, i) => insPlTr.run(p.id, tid, i))
      n++
    }
    console.log(`  playlists: ${n}`)

    // Diet products
    const insProd = db.prepare(`INSERT OR IGNORE INTO diet_products (id, user_id, name, calories, protein, fat, carbs, created_at) VALUES (?,?,?,?,?,?,?,?)`)
    n = 0
    for (const p of data.dietProducts || []) {
      insProd.run(p.id, userId, p.name, p.per100g.calories, p.per100g.protein, p.per100g.fat, p.per100g.carbs, p.createdAt || now)
      n++
    }
    console.log(`  diet products: ${n}`)

    // Diet dishes
    const insDish = db.prepare(`INSERT OR IGNORE INTO diet_dishes (id, user_id, name, total_grams, cal_per100, protein_per100, fat_per100, carbs_per100, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    const insDishIng = db.prepare(`INSERT OR IGNORE INTO diet_dish_ingredients (dish_id, product_id, product_name, grams) VALUES (?,?,?,?)`)
    n = 0
    for (const d of data.dietDishes || []) {
      insDish.run(d.id, userId, d.name, d.totalGrams, d.per100g.calories, d.per100g.protein, d.per100g.fat, d.per100g.carbs, d.createdAt || now)
      for (const i of d.ingredients || []) insDishIng.run(d.id, i.productId, i.productName, i.grams)
      n++
    }
    console.log(`  diet dishes: ${n}`)

    // Diet log
    const insLog = db.prepare(`INSERT OR IGNORE INTO diet_log (id, user_id, name, grams, meal, date, calories, protein, fat, carbs, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    n = 0
    for (const e of data.dietLog || []) {
      insLog.run(e.id, userId, e.name, e.grams, e.meal, e.date, e.calories, e.protein, e.fat, e.carbs, e.createdAt || now)
      n++
    }
    console.log(`  diet log: ${n}`)

    // Diet goals
    const dg = data.dietGoals || { calories: 2000, protein: 150, fat: 65, carbs: 250 }
    db.prepare(`INSERT OR REPLACE INTO diet_goals (user_id, calories, protein, fat, carbs) VALUES (?,?,?,?,?)`).run(userId, dg.calories, dg.protein, dg.fat, dg.carbs)

    // Weight log
    const insWt = db.prepare(`INSERT OR IGNORE INTO weight_log (id, user_id, date, weight, note) VALUES (?,?,?,?,?)`)
    n = 0
    for (const e of data.weightLog || []) {
      insWt.run(e.id, userId, e.date, e.weight, e.note || '')
      n++
    }
    console.log(`  weight log: ${n}`)
    db.prepare(`INSERT OR REPLACE INTO weight_goals (user_id, goal) VALUES (?,?)`).run(userId, data.weightGoal ?? null)

    // Body measurements
    const insMeas = db.prepare(`INSERT OR IGNORE INTO body_measurements (id, user_id, date, waist, chest, hips, left_arm, right_arm, left_thigh, right_thigh, neck, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    n = 0
    for (const e of data.bodyMeasurements || []) {
      const v = e.values || {}
      insMeas.run(e.id, userId, e.date, v.waist??null, v.chest??null, v.hips??null, v.leftArm??null, v.rightArm??null, v.leftThigh??null, v.rightThigh??null, v.neck??null, e.note||'', e.createdAt||now)
      n++
    }
    console.log(`  body measurements: ${n}`)

    // Study topics + chapters
    const insTopic = db.prepare(`INSERT OR IGNORE INTO study_topics (id, user_id, title, description, created_at, updated_at) VALUES (?,?,?,?,?,?)`)
    const insChap = db.prepare(`INSERT OR IGNORE INTO study_chapters (id, topic_id, title, content, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`)
    n = 0
    for (const t of data.study || []) {
      insTopic.run(t.id, userId, t.title, t.description || '', t.createdAt || now, t.updatedAt || now)
      ;(t.chapters || []).forEach((c, i) => insChap.run(c.id, t.id, c.title, encryptField(c.content || '', CODEWORD), i, c.createdAt || now, c.updatedAt || now))
      n++
    }
    console.log(`  study topics: ${n}`)

    // Tasks
    const insTask = db.prepare(`INSERT OR IGNORE INTO tasks (id, user_id, title, description, category, priority, status, deadline, remind_before, created_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    n = 0
    const plans = data.plans || {}
    for (const t of plans.tasks || []) {
      insTask.run(t.id, userId, t.title, t.description||'', t.category||'', t.priority||'medium', t.status||'todo', t.deadline||null, t.remindBefore??null, t.createdAt||now, t.completedAt||null)
      n++
    }
    console.log(`  tasks: ${n}`)

    const ps = plans.settings || { remindInterval: 30 }
    db.prepare(`INSERT OR REPLACE INTO plan_settings (user_id, remind_interval) VALUES (?,?)`).run(userId, ps.remindInterval || 30)
    const insPlanCat = db.prepare(`INSERT OR IGNORE INTO plan_categories (user_id, name) VALUES (?,?)`)
    for (const c of plans.categories || []) insPlanCat.run(userId, c)

    // Wishlist
    const insWish = db.prepare(`INSERT OR IGNORE INTO wishlist_items (id, user_id, title, category, url, price, priority, image, note, purchased, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    const insWishCat = db.prepare(`INSERT OR IGNORE INTO wishlist_categories (user_id, name) VALUES (?,?)`)
    const wl = data.wishlist || { items: [], categories: [] }
    n = 0
    for (const item of wl.items || []) {
      insWish.run(item.id, userId, item.title, item.category||'', item.url||null, item.price??null, item.priority||'want', item.image||null, item.note||'', item.purchased ? 1 : 0, item.createdAt||now)
      n++
    }
    for (const c of wl.categories || []) insWishCat.run(userId, c)
    console.log(`  wishlist items: ${n}`)

  })()

  console.log(`✅ User ${userId} migrated`)
}

console.log('\n🎉 Migration complete!')
db.close()
