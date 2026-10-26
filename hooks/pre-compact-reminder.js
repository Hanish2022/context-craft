#!/usr/bin/env node
// PreCompact hook (manual trigger only -- see hooks/hooks.json). Reminds the
// user to pin durable facts before a manual /compact if they haven't already,
// by checking for SESSION_FACTS.md. Never touches auto-compact: blocking that
// is either silently pointless (no message can be shown) or can surface a
// real API error if auto-compact was recovering from a context-limit error.

import fs from 'node:fs'
import path from 'node:path'

let input = ''
process.stdin.on('data', (chunk) => {
  input += chunk
})

process.stdin.on('end', () => {
  let data
  try {
    data = JSON.parse(input)
  } catch {
    process.exit(0) // can't parse the input -- don't block on a guess
  }

  if (data.trigger !== 'manual') {
    process.exit(0)
  }

  const projectDir = process.env.CLAUDE_PROJECT_DIR || data.cwd || process.cwd()
  const factsFile = path.join(projectDir, 'SESSION_FACTS.md')
  const markerFile = path.join(projectDir, '.claude', '.contextcraft-pin-reminded')

  if (fs.existsSync(factsFile) || fs.existsSync(markerFile)) {
    process.exit(0) // already pinned, or already reminded once for this project
  }

  try {
    fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true })
    fs.writeFileSync(markerFile, new Date().toISOString())
  } catch {
    // if the marker can't be written, the reminder may repeat -- not fatal
  }

  process.stderr.write(
    'ContextCraft: no SESSION_FACTS.md found for this session. If there are decisions, ' +
      'branch/version details, or findings that must survive compaction, ask ContextCraft ' +
      'to "pin the durable facts" first. Run /compact again to proceed anyway -- this ' +
      "reminder won't repeat for this project.\n"
  )
  process.exit(2)
})
