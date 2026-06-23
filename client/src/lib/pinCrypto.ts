export const PIN_KEY = 'lock_pin'
const STORED_KEY = 'session_codeword'

async function encryptWithPin(text: string, pin: string): Promise<string> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey'])
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text))
  const buf = new Uint8Array(16 + 12 + encrypted.byteLength)
  buf.set(salt, 0); buf.set(iv, 16); buf.set(new Uint8Array(encrypted), 28)
  return btoa(String.fromCharCode(...buf))
}

async function decryptWithPin(encoded: string, pin: string): Promise<string> {
  const buf = Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: buf.slice(0, 16), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(16, 28) }, key, buf.slice(28))
  return new TextDecoder().decode(decrypted)
}

export async function persistCodeword(codeword: string, pin: string | null): Promise<void> {
  if (pin) {
    localStorage.setItem(STORED_KEY, 'e:' + await encryptWithPin(codeword, pin))
  } else {
    localStorage.setItem(STORED_KEY, 'p:' + btoa(encodeURIComponent(codeword)))
  }
}

// Synchronous — only works for plain (no-PIN) stored codeword
export function restoreCodewordSync(): string | null {
  const stored = localStorage.getItem(STORED_KEY)
  if (!stored?.startsWith('p:')) return null
  try { return decodeURIComponent(atob(stored.slice(2))) } catch { return null }
}

export async function restoreCodewordWithPin(pin: string): Promise<string | null> {
  const stored = localStorage.getItem(STORED_KEY)
  if (!stored) return null

  // Encrypted with PIN — normal case
  if (stored.startsWith('e:')) {
    try { return await decryptWithPin(stored.slice(2), pin) } catch { return null }
  }

  // Plain format — was stored before PIN was set. Read it and re-encrypt with PIN so
  // next unlock needs only PIN (no codeword prompt).
  if (stored.startsWith('p:')) {
    try {
      const cw = decodeURIComponent(atob(stored.slice(2)))
      await persistCodeword(cw, pin)
      return cw
    } catch { return null }
  }

  return null
}

export function clearPersistedCodeword(): void {
  localStorage.removeItem(STORED_KEY)
}
