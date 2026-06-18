import api from '@/api'

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('image', file)
  const res = await api.post('/images', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return res.data.url
}

// Открыть диалог выбора файла и загрузить
export function pickAndUpload(): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      try {
        const url = await uploadImage(file)
        resolve(url)
      } catch {
        resolve(null)
      }
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}
