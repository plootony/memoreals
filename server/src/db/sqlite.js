import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../../data')
mkdirSync(DATA_DIR, { recursive: true })

const DB_PATH = join(DATA_DIR, 'db.sqlite')

const db = new Database(DB_PATH)

// Performance settings
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('foreign_keys = ON')

db.exec(`
  -- ── Users ──────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id               TEXT PRIMARY KEY,
    username         TEXT UNIQUE NOT NULL,
    password_hash    TEXT NOT NULL,
    codeword_verifier TEXT NOT NULL,
    created_at       TEXT NOT NULL
  );

  -- ── Journal ─────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS journal (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    content    TEXT NOT NULL DEFAULT '',
    date       TEXT NOT NULL,
    photos     TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_journal_user_date ON journal(user_id, date);

  -- ── Finance: categories ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS finance_categories (
    id      TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name    TEXT NOT NULL,
    color   TEXT NOT NULL DEFAULT '#6366f1',
    icon    TEXT NOT NULL DEFAULT '📁'
  );

  -- ── Finance: transactions ────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS transactions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    type        TEXT NOT NULL,
    amount      REAL NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id TEXT,
    date        TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);

  -- ── Finance: debts ───────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS debts (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL,
    name             TEXT NOT NULL,
    total_amount     REAL NOT NULL,
    monthly_payment  REAL,
    direction        TEXT NOT NULL,
    note             TEXT NOT NULL DEFAULT '',
    due_date         TEXT,
    created_at       TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS debt_payments (
    id      TEXT PRIMARY KEY,
    debt_id TEXT NOT NULL,
    amount  REAL NOT NULL,
    note    TEXT NOT NULL DEFAULT '',
    date    TEXT NOT NULL
  );

  -- ── Finance: cushion ────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS cushion (
    user_id TEXT PRIMARY KEY,
    goal    REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS cushion_contributions (
    id      TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount  REAL NOT NULL,
    note    TEXT NOT NULL DEFAULT '',
    date    TEXT NOT NULL
  );

  -- ── Music: tracks ────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS music_tracks (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL,
    artist      TEXT NOT NULL DEFAULT '',
    filename    TEXT NOT NULL,
    cover       TEXT,
    uploaded_at TEXT NOT NULL
  );

  -- ── Music: playlists ─────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS music_playlists (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id TEXT NOT NULL,
    track_id    TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (playlist_id, track_id)
  );

  -- ── Diet: products ───────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS diet_products (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    calories   REAL NOT NULL,
    protein    REAL NOT NULL,
    fat        REAL NOT NULL,
    carbs      REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  -- ── Diet: dishes ─────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS diet_dishes (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    name         TEXT NOT NULL,
    total_grams  REAL NOT NULL,
    cal_per100   REAL NOT NULL,
    protein_per100 REAL NOT NULL,
    fat_per100   REAL NOT NULL,
    carbs_per100 REAL NOT NULL,
    created_at   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS diet_dish_ingredients (
    dish_id      TEXT NOT NULL,
    product_id   TEXT NOT NULL,
    product_name TEXT NOT NULL,
    grams        REAL NOT NULL,
    PRIMARY KEY (dish_id, product_id)
  );

  -- ── Diet: log ────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS diet_log (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    grams      REAL NOT NULL,
    meal       TEXT NOT NULL,
    date       TEXT NOT NULL,
    calories   REAL NOT NULL,
    protein    REAL NOT NULL,
    fat        REAL NOT NULL,
    carbs      REAL NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_diet_log_user_date ON diet_log(user_id, date);

  -- ── Diet: goals ──────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS diet_goals (
    user_id  TEXT PRIMARY KEY,
    calories REAL NOT NULL DEFAULT 2000,
    protein  REAL NOT NULL DEFAULT 150,
    fat      REAL NOT NULL DEFAULT 65,
    carbs    REAL NOT NULL DEFAULT 250
  );

  -- ── Weight ───────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS weight_log (
    id      TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date    TEXT NOT NULL,
    weight  REAL NOT NULL,
    note    TEXT NOT NULL DEFAULT '',
    UNIQUE(user_id, date)
  );
  CREATE TABLE IF NOT EXISTS weight_goals (
    user_id TEXT PRIMARY KEY,
    goal    REAL
  );

  -- ── Body measurements ────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS body_measurements (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    date        TEXT NOT NULL,
    waist       REAL,
    chest       REAL,
    hips        REAL,
    left_arm    REAL,
    right_arm   REAL,
    left_thigh  REAL,
    right_thigh REAL,
    neck        REAL,
    note        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_measurements_user_date ON body_measurements(user_id, date);

  -- ── Study: topics ────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS study_topics (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  -- ── Study: chapters (content encrypted) ─────────────────────────────────────
  CREATE TABLE IF NOT EXISTS study_chapters (
    id         TEXT PRIMARY KEY,
    topic_id   TEXT NOT NULL,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- ── Tasks ────────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS tasks (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    category      TEXT NOT NULL DEFAULT '',
    priority      TEXT NOT NULL DEFAULT 'medium',
    status        TEXT NOT NULL DEFAULT 'todo',
    deadline      TEXT,
    remind_before INTEGER,
    created_at    TEXT NOT NULL,
    completed_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);

  CREATE TABLE IF NOT EXISTS plan_settings (
    user_id         TEXT PRIMARY KEY,
    remind_interval INTEGER NOT NULL DEFAULT 30
  );
  CREATE TABLE IF NOT EXISTS plan_categories (
    user_id TEXT NOT NULL,
    name    TEXT NOT NULL,
    PRIMARY KEY (user_id, name)
  );

  -- ── Wishlist ─────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS wishlist_items (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    title      TEXT NOT NULL,
    category   TEXT NOT NULL DEFAULT '',
    url        TEXT,
    price      REAL,
    priority   TEXT NOT NULL DEFAULT 'want',
    image      TEXT,
    note       TEXT NOT NULL DEFAULT '',
    purchased  INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS wishlist_categories (
    user_id TEXT NOT NULL,
    name    TEXT NOT NULL,
    PRIMARY KEY (user_id, name)
  );

  -- ── Gallery ──────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS photo_albums (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    name           TEXT NOT NULL,
    is_system      INTEGER NOT NULL DEFAULT 0,
    cover_photo_id TEXT,
    description    TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS photos (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    album_id   TEXT NOT NULL,
    url        TEXT NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_photos_user_album ON photos(user_id, album_id);
`)

// Migrations for existing databases
for (const sql of [
  'ALTER TABLE photo_albums ADD COLUMN cover_photo_id TEXT',
  "ALTER TABLE photo_albums ADD COLUMN description TEXT NOT NULL DEFAULT ''",
]) {
  try { db.exec(sql) } catch {}
}

export default db
