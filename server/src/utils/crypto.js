import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LEN = 32
const IV_LEN = 16
const SALT_LEN = 32
const TAG_LEN = 16
const PBKDF2_ITER = 100000

export function deriveKey(passphrase, salt) {
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITER, KEY_LEN, 'sha256')
}

export function encrypt(text, passphrase) {
  const salt = randomBytes(SALT_LEN)
  const key = deriveKey(passphrase, salt)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(typeof text === 'string' ? text : JSON.stringify(text), 'utf8'),
    cipher.final()
  ])
  const tag = cipher.getAuthTag()

  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64')
}

export function decrypt(encoded, passphrase) {
  const buf = Buffer.from(encoded, 'base64')
  const salt = buf.subarray(0, SALT_LEN)
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN)
  const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN)
  const encrypted = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN)

  const key = deriveKey(passphrase, salt)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}
