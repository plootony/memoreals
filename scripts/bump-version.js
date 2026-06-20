#!/usr/bin/env node
/**
 * Auto-bumps version based on conventional commit messages since last deploy.
 *
 * Rules:
 *   feat!: / BREAKING CHANGE  → major (X.0.0)
 *   feat:                      → minor (x.Y.0)
 *   fix: / chore: / refactor:  → patch (x.y.Z)
 *
 * Reads current version from server/data/version.json (runtime, gitignore'd).
 * Falls back to version.json (base version in git) on first run.
 * Writes updated version back to server/data/version.json.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const RUNTIME_FILE = join(ROOT, 'server/data/version.json')
const BASE_FILE    = join(ROOT, 'version.json')

// Read current deployed version
let current = { version: '1.0.0', commit: null }
try {
  current = JSON.parse(readFileSync(RUNTIME_FILE, 'utf8'))
} catch {
  try { current = { ...JSON.parse(readFileSync(BASE_FILE, 'utf8')), commit: null } } catch {}
}

const [major, minor, patch] = current.version.split('.').map(Number)

// Get commits since last deploy
let commits = ''
try {
  const since = current.commit ? `${current.commit}..HEAD` : '--max-count=50'
  commits = execSync(`git log ${since} --pretty=format:"%s"`, { cwd: ROOT }).toString()
} catch {}

// Determine bump type
const hasMajor = /BREAKING CHANGE|feat!:/.test(commits)
const hasMinor = !hasMajor && /^feat:/m.test(commits)

let nMajor = major, nMinor = minor, nPatch = patch
if (hasMajor)      { nMajor++;  nMinor = 0; nPatch = 0 }
else if (hasMinor) {            nMinor++;   nPatch = 0 }
else               {                        nPatch++    }

const newVersion = `${nMajor}.${nMinor}.${nPatch}`
const newCommit  = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()

mkdirSync(join(ROOT, 'server/data'), { recursive: true })
writeFileSync(RUNTIME_FILE, JSON.stringify({
  version:   newVersion,
  buildDate: new Date().toISOString(),
  commit:    newCommit,
}, null, 2))

console.log(`Version: ${current.version} → ${newVersion}  (${newCommit})`)
