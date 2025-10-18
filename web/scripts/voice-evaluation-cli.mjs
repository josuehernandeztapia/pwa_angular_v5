#!/usr/bin/env node
/**
 * Voice evaluation CLI helper.
 *
 * Usage:
 *   node scripts/voice-evaluation-cli.mjs --audio samples/voice.wav --question route_security --municipality nezahualcoyotl
 *
 * Environment variables:
 *   VOICE_BFF_URL   Target BFF URL (default http://localhost:3000)
 *   VOICE_API_TOKEN Optional bearer token appended to requests
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const args = new Map()
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.split('=')
  if (key.startsWith('--')) {
    args.set(key.slice(2), value ?? 'true')
  }
}

function usage() {
  console.log(`
Voice Evaluation CLI

Options:
  --audio=path/to/file.wav
  --question=question_id
  --municipality=municipality_slug
  --context=contextId (optional, default cli_test)
  --dry-run (prints payload without sending)
`)
}

if (args.has('help')) {
  usage()
  process.exit(0)
}

const audioPath = args.get('audio')
if (!audioPath) {
  console.error('Missing --audio argument')
  usage()
  process.exit(1)
}

const questionId = args.get('question') ?? 'route_security_issues'
const municipality = args.get('municipality') ?? 'aguascalientes'
const contextId = args.get('context') ?? 'cli_test'
const dryRun = args.has('dry-run')

const bffUrl = process.env.VOICE_BFF_URL || process.env.BFF_BASE_URL || 'http://localhost:3000'
const endpoint = new URL('/avi/voice-evaluation/test', bffUrl)

async function encodeAudio(filePath) {
  const buffer = await fs.readFile(filePath)
  return buffer.toString('base64')
}

function buildPayload(base64Audio) {
  const now = new Date().toISOString()
  return {
    questionId,
    contextId,
    municipality,
    submittedAt: now,
    audio: {
      base64: base64Audio,
      mimeType: inferMimeType(audioPath),
      fileName: path.basename(audioPath)
    }
  }
}

function inferMimeType(file) {
  const lower = file.toLowerCase()
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  return 'application/octet-stream'
}

async function main() {
  try {
    const audioBase64 = await encodeAudio(audioPath)
    const payload = buildPayload(audioBase64)

    if (dryRun) {
      console.log(JSON.stringify(payload, null, 2))
      return
    }

    const headers = { 'Content-Type': 'application/json' }
    if (process.env.VOICE_API_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.VOICE_API_TOKEN}`
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`Voice evaluation failed: ${response.status} ${response.statusText}
${text}`)
      process.exit(1)
    }

    const body = await response.json()
    console.log('
✅ Voice evaluation response:')
    console.log(JSON.stringify(body, null, 2))
  } catch (error) {
    console.error('Voice evaluation CLI error:', error)
    process.exit(1)
  }
}

main()
