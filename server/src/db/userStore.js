import { dataDb } from './index.js'
import { encrypt, decrypt } from '../utils/crypto.js'

export async function getUserData(userId, codeword) {
  await dataDb.read()
  const raw = dataDb.data.entries[userId]
  if (!raw) return getDefaultData()
  try {
    return JSON.parse(decrypt(raw, codeword))
  } catch {
    throw new Error('DECRYPT_FAILED')
  }
}

export async function setUserData(userId, codeword, data) {
  await dataDb.read()
  dataDb.data.entries[userId] = encrypt(JSON.stringify(data), codeword)
  await dataDb.write()
}

function getDefaultData() {
  return {
    journal: [],
    transactions: [],
    categories: [],
    playlists: [],
    tracks: [],
    dietLog: [],
    dietGoals: { calories: 2000, protein: 150, fat: 65, carbs: 250 },
    dietProducts: [],
    dietDishes: [],
    weightLog: [],
    weightGoal: null,
    debts: [],
    cushion: { goal: 0, contributions: [] },
    study: [],
    wishlist: { items: [], categories: ['Электроника', 'Одежда', 'Дом', 'Спорт', 'Другое'] },
    plans: {
      tasks: [],
      categories: ['Работа', 'Личное', 'Учёба', 'Здоровье'],
      settings: { remindInterval: 30 }
    }
  }
}
