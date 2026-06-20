import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const IV_LEN = 16
const TAG_LEN = 16

function deriveKey(codeword) {
  return createHash('sha256').update(codeword).digest()
}

export function encryptField(text, codeword) {
  if (!text) return text
  const key = deriveKey(codeword)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decryptField(encoded, codeword) {
  if (!encoded) return encoded
  try {
    const buf = Buffer.from(encoded, 'base64')
    const iv = buf.subarray(0, IV_LEN)
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
    const data = buf.subarray(IV_LEN + TAG_LEN)
    const key = deriveKey(codeword)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('DECRYPT_FAILED')
  }
}
