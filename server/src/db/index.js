import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../../data')

// Гарантируем существование директории при любом старте
mkdirSync(DATA_DIR, { recursive: true })

function createDb(filename, defaults) {
  const adapter = new JSONFile(join(DATA_DIR, filename))
  const db = new Low(adapter, defaults)
  return db
}

// auth db — не шифруется (только хэши паролей)
export const authDb = createDb('auth.json', { users: [] })

// encrypted data db — содержит зашифрованные записи по userId
export const dataDb = createDb('data.json', { entries: {} })

export async function initDbs() {
  await authDb.read()
  await dataDb.read()
}
