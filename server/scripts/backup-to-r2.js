#!/usr/bin/env node
/**
 * Backs up db.sqlite to Cloudflare R2 under backups/ prefix.
 * Keeps the last 30 backups, deletes older ones automatically.
 * Called by backup.sh after local backup.
 */

import 'dotenv/config'
import Database from 'better-sqlite3'
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { readFileSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH   = join(__dirname, '../data/db.sqlite')
const TMP_PATH  = join(__dirname, '../data/.backup_tmp.sqlite')

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

const BUCKET     = process.env.R2_BUCKET
const MAX_KEEP   = 30
const PREFIX     = 'backups/'

const db = new Database(DB_PATH)

await db.backup(TMP_PATH)
db.close()

const date = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
const key  = `${PREFIX}db_${date}.sqlite`

await client.send(new PutObjectCommand({
  Bucket:      BUCKET,
  Key:         key,
  Body:        readFileSync(TMP_PATH),
  ContentType: 'application/octet-stream',
}))

unlinkSync(TMP_PATH)
console.log(`✅ R2 backup uploaded: ${key}`)

// Удаляем старые бэкапы — оставляем последние MAX_KEEP
const list = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX }))
const all  = (list.Contents || []).sort((a, b) => a.Key.localeCompare(b.Key))

if (all.length > MAX_KEEP) {
  const toDelete = all.slice(0, all.length - MAX_KEEP)
  await client.send(new DeleteObjectsCommand({
    Bucket: BUCKET,
    Delete: { Objects: toDelete.map(o => ({ Key: o.Key })) },
  }))
  console.log(`🗑  Deleted ${toDelete.length} old R2 backups`)
}
