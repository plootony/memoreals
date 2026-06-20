import api from '@/api'

export async function uploadImage(file: File, type?: 'cover', source?: 'journal'): Promise<string> {
  const form = new FormData()
  form.append('image', file)
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (source) params.set('source', source)
  const query = params.toString() ? '?' + params.toString() : ''
  const res = await api.post('/images' + query, form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return res.data.url
}

// Открыть диалог выбора файла и загрузить, с колбэком состояния
export function pickAndUpload(
  onLoading?: (v: boolean) => void,
  type?: 'cover',
  source?: 'journal'
): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      onLoading?.(true)
      try {
        const url = await uploadImage(file, type, source)
        resolve(url)
      } catch {
        resolve(null)
      } finally {
        onLoading?.(false)
      }
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}
