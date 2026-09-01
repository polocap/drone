import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import http from 'http'
import { fileURLToPath } from 'url'

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CONFIG_PATH = process.env.CONFIG_PATH || '/etc/drone'
const DRONES_PATH = path.join(CONFIG_PATH, 'drones.json')

async function ensureConfigDir() {
  try { await fs.mkdir(CONFIG_PATH, { recursive: true }) } catch {}
}

async function loadDrones() {
  await ensureConfigDir()
  try {
    const data = await fs.readFile(DRONES_PATH, 'utf8')
    const drones = JSON.parse(data)
    return Array.isArray(drones) ? drones : []
  } catch {
    // fallback to example if no file
    try {
      const ex = await fs.readFile(path.join(__dirname, '../../../config/drones.json'), 'utf8')
      return JSON.parse(ex)
    } catch { return [] }
  }
}

async function saveDrones(drones) {
  await ensureConfigDir()
  await fs.writeFile(DRONES_PATH, JSON.stringify(drones, null, 2))
}

function validateId(id) {
  return typeof id === 'string' && /^[a-z0-9_-]{2,32}$/i.test(id.trim())
}

// Fetch MediaMTX active paths
function fetchActivePaths() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:9997/v3/paths/list', { timeout: 1500 }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json.items || [])
        } catch { resolve([]) }
      })
    })
    req.on('error', () => resolve([]))
    req.on('timeout', () => { try { req.destroy() } catch {}; resolve([]) })
    req.setTimeout(1500, () => { try { req.destroy() } catch {}; resolve([]) })
  })
}

// List all drones
router.get('/', async (req, res) => {
  try {
    const drones = await loadDrones()
    res.json(drones)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Active drones — which drone_ids are currently publishing to RTMP
router.get('/active', async (req, res) => {
  try {
    const drones = await loadDrones()
    const droneMap = new Map(drones.map(d => [d.id, d]))
    const paths = await fetchActivePaths()
    const active = []
    let genericActive = false
    let genericReady = false

    for (const p of paths) {
      if (!p.ready) continue
      const name = p.name || ''
      // generic live (no drone_id)
      if (name === 'live') {
        genericActive = true
        genericReady = true
        active.push({ id: null, path: 'live', name: 'Flux générique', type: null, generic: true, ready: true, source: p.source, bytesReceived: p.bytesReceived })
        continue
      }
      if (name.startsWith('live/')) {
        const droneId = name.split('/')[1]
        const info = droneMap.get(droneId)
        if (info) {
          active.push({ ...info, path: name, droneId, ready: true, source: p.source, bytesReceived: p.bytesReceived, generic: false })
        } else {
          // unknown drone streaming with valid path but not in registry
          active.push({ id: droneId, name: droneId, type: 'Inconnu', path: name, droneId, ready: true, source: p.source, bytesReceived: p.bytesReceived, generic: false, unknown: true })
        }
      }
      // also handle legacy 'drone' path as generic?
      if (name === 'drone' && p.ready) {
        genericActive = true
        active.push({ id: null, path: 'drone', name: 'Flux générique', generic: true, ready: true, source: p.source })
      }
    }

    res.json({ active, genericActive, drones, timestamp: new Date().toISOString() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const drones = await loadDrones()
    const d = drones.find(x => x.id === req.params.id)
    if (!d) return res.status(404).json({ error: 'Drone non trouvé' })
    res.json(d)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/', async (req, res) => {
  try {
    const { id, name, type, unit, description } = req.body
    if (!validateId(id)) return res.status(400).json({ error: 'id invalide: 2-32 chars, a-z 0-9 _ -' })
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name requis' })
    const drones = await loadDrones()
    if (drones.find(d => d.id === id.trim())) return res.status(409).json({ error: 'id déjà existant' })
    const drone = { id: id.trim(), name: name.trim(), type: (type || '').trim(), unit: (unit || '').trim(), description: (description || '').trim() }
    drones.push(drone)
    await saveDrones(drones)
    res.status(201).json(drone)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/:id', async (req, res) => {
  try {
    const drones = await loadDrones()
    const idx = drones.findIndex(d => d.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Drone non trouvé' })
    const { name, type, unit, description } = req.body
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name invalide' })
      drones[idx].name = name.trim()
    }
    if (type !== undefined) drones[idx].type = String(type).trim()
    if (unit !== undefined) drones[idx].unit = String(unit).trim()
    if (description !== undefined) drones[idx].description = String(description).trim()
    await saveDrones(drones)
    res.json(drones[idx])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/:id', async (req, res) => {
  try {
    const drones = await loadDrones()
    const idx = drones.findIndex(d => d.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'Drone non trouvé' })
    const removed = drones.splice(idx, 1)[0]
    await saveDrones(drones)
    res.json({ ok: true, removed })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router
