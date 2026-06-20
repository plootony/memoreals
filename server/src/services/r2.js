import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

const BUCKET = process.env.R2_BUCKET
const PUBLIC_URL = process.env.R2_PUBLIC_URL // https://pub-xxx.r2.dev

export async function uploadToR2(buffer, filename, contentType = 'image/webp') {
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: filename,
    Body: buffer,
    ContentType: contentType,
  }))
  return `${PUBLIC_URL}/${filename}`
}

export async function deleteFromR2(filename) {
  try {
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: filename }))
  } catch {
    // не критично если файл уже удалён
  }
}
