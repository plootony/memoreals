import api from '@/api'

export async function uploadImage(file: File, type?: 'cover'): Promise<string> {
  const form = new FormData()
  form.append('image', file)
  const res = await api.post('/images' + (type ? `?type=${type}` : ''), form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return res.data.url
}

// Открыть диалог выбора файла и загрузить, с колбэком состояния
export function pickAndUpload(
  onLoading?: (v: boolean) => void,
  type?: 'cover'
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
        const url = await uploadImage(file, type)
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
