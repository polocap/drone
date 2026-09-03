import { spawn } from 'child_process'
import fs from 'fs/promises'
import http from 'http'

// Retransmission of the live drone stream towards the external RTMP server
// configured in the settings page (Réglages → Serveur externe).
//
// The stream exits through the wired link to the 4G router (default route),
// so enabling the push on a 4G-connected server retransmits over 4G.
//
// The manager polls the MediaMTX API for ready paths and keeps exactly one
// ffmpeg push running towards the configured URL (generic `live` path
// preferred, otherwise the first active per-drone path).

const SETTINGS_PATH = `${process.env.CONFIG_PATH || '/etc/drone'}/settings.json`
const MEDIAMTX_API = 'http://127.0.0.1:9997/v3/paths/list'
const LOCAL_RTMP = 'rtmp://127.0.0.1:1935'

const POLL_INTERVAL_MS = parseInt(process.env.RTMP_PUSH_POLL_MS) || 3000
const MAX_RETRY_DELAY_MS = parseInt(process.env.RTMP_PUSH_MAX_DELAY_MS) || 30000
const RETRY_RESET_MS = 60000 // consecutive time running after which retries are forgotten

// path name -> { proc, url, startedAt, retries, nextAttemptAt, lastError }
const pushes = new Map()

let polling = false
let pollTimer = null

export async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_PATH, 'utf8')
    const s = JSON.parse(data)
    return {
      enabled: s.external_rtmp_enabled === true,
      url: typeof s.external_rtmp_url === 'string' ? s.external_rtmp_url.trim() : ''
    }
  } catch {
    return { enabled: false, url: '' }
  }
}

function isValidRtmpUrl(url) {
  return /^rtmps?:\/\/\S+/.test(url)
}

function fetchReadyPaths() {
  return new Promise((resolve) => {
    const req = http.get(MEDIAMTX_API, { timeout: 1500 }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve((json.items || []).filter((p) => p.ready).map((p) => p.name))
        } catch {
          resolve([])
        }
      })
    })
    req.on('error', () => resolve([]))
    req.on('timeout', () => {
      try { req.destroy() } catch {}
      resolve([])
    })
  })
}

// One stream is retransmitted: generic `live` if present, else the first
// per-drone path (live/<drone_id>), so a single 4G uplink is never shared
// between several pushes.
function chooseStreamPath(readyPaths) {
  if (!readyPaths.length) return null
  const generic = readyPaths.find((n) => n === 'live' || n === 'drone')
  if (generic) return generic
  return [...readyPaths].sort()[0]
}

function stopPush(pathName) {
  const entry = pushes.get(pathName)
  if (!entry) return
  pushes.delete(pathName)
  try { entry.proc.kill('SIGTERM') } catch {}
}

function stopAllPushes() {
  for (const name of Array.from(pushes.keys())) stopPush(name)
}

function startPush(pathName, url) {
  const existing = pushes.get(pathName)
  if (existing) {
    if (existing.url === url && existing.proc && existing.proc.exitCode === null) return
    stopPush(pathName)
  }

  // Keep the retry counter across restarts so the backoff actually grows
  // when reconcile clears a dead entry and calls startPush again.
  const entry = {
    proc: null,
    url,
    startedAt: Date.now(),
    retries: existing ? existing.retries : 0,
    nextAttemptAt: 0,
    lastError: existing ? existing.lastError : null
  }
  pushes.set(pathName, entry)

  const spawnFfmpeg = () => {
    // rw_timeout (µs): abort if no I/O for 15s — a hung 4G link must look
    // like a failure so the retry loop restarts the push
    const proc = spawn('ffmpeg', [
      '-rw_timeout', '15000000',
      '-rtmp_live', 'live',
      '-i', `${LOCAL_RTMP}/${pathName}`,
      '-c', 'copy',
      '-rw_timeout', '15000000',
      '-f', 'flv',
      url
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, MALLOC_ARENA_MAX: '2' }
    })
    entry.proc = proc
    entry.startedAt = Date.now()

    let lastErrorLog = 0
    proc.stderr.on('data', (data) => {
      const msg = data.toString()
      const now = Date.now()
      if ((msg.includes('error') || msg.includes('Error')) && now - lastErrorLog > 5000) {
        entry.lastError = msg.trim().split('\n').pop().slice(0, 200)
        console.error(`RTMP push [${pathName}] ffmpeg error:`, entry.lastError)
        lastErrorLog = now
      }
    })

    proc.on('error', (e) => {
      console.error(`RTMP push [${pathName}] failed to start ffmpeg:`, e.message)
      entry.lastError = e.message
    })

    proc.on('close', (code) => {
      if (pushes.get(pathName) !== entry) return // replaced or stopped
      const ranFor = Date.now() - entry.startedAt
      if (ranFor > RETRY_RESET_MS) entry.retries = 0
      if (code !== 0) {
        entry.retries += 1
        const delay = Math.min(1000 * Math.pow(2, entry.retries), MAX_RETRY_DELAY_MS)
        entry.nextAttemptAt = Date.now() + delay
        entry.lastError = `ffmpeg exit code ${code}`
        console.log(`RTMP push [${pathName}] exited (code ${code}), retry in ${delay}ms (attempt ${entry.retries})`)
      } else {
        pushes.delete(pathName)
      }
    })
  }

  spawnFfmpeg()
}

async function reconcile() {
  const settings = await loadSettings()
  const readyPaths = await fetchReadyPaths()
  const target = chooseStreamPath(readyPaths)

  const shouldPush = settings.enabled && isValidRtmpUrl(settings.url) && target !== null

  if (!shouldPush) {
    stopAllPushes()
    return
  }

  // Kill pushes towards other paths or stale URLs
  for (const [name, entry] of Array.from(pushes.entries())) {
    if (name !== target || entry.url !== settings.url) stopPush(name)
  }

  const entry = pushes.get(target)
  if (entry) {
    const healthy = entry.proc && entry.proc.exitCode === null && entry.url === settings.url
    if (healthy) return // already pushing the right stream to the right URL
    if (Date.now() < entry.nextAttemptAt) return // waiting to retry after a failure
    // dead or stale entry: fall through, startPush clears it while
    // preserving the retry counter (so the backoff keeps growing)
  }

  console.log(`RTMP push: retransmission de ${target} vers ${settings.url}`)
  startPush(target, settings.url)
}

async function tick() {
  if (polling) return
  polling = true
  try {
    await reconcile()
  } catch (e) {
    console.error('RTMP push reconcile error:', e.message)
  } finally {
    polling = false
  }
}

export function startPushManager() {
  if (pollTimer) return
  console.log('RTMP push manager démarré (retransmission externe)')
  tick()
  pollTimer = setInterval(tick, POLL_INTERVAL_MS)
  pollTimer.unref?.()
}

// Called right after the settings are saved so a change takes effect
// without waiting for the next poll.
export function applySettingsNow() {
  tick()
}

export function getPushStatus() {
  let activeStream = null
  let lastError = null
  for (const [name, entry] of pushes.entries()) {
    const running = entry.proc && entry.proc.exitCode === null
    if (running && !activeStream) activeStream = name
    if (!running && entry.lastError && !lastError) lastError = entry.lastError
  }
  return {
    active: activeStream !== null,
    stream: activeStream,
    last_error: activeStream ? null : lastError
  }
}

function gracefulShutdown() {
  stopAllPushes()
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)
