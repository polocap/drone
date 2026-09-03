import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { applySettingsNow } from '../services/rtmp-push.js'

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CONFIG_PATH = process.env.CONFIG_PATH || '/etc/drone'
const USERS_PATH = path.join(CONFIG_PATH, 'users.json')
const STATE_PATH = path.join(CONFIG_PATH, 'state.json')

const SETTINGS_PATH = path.join(CONFIG_PATH, 'settings.json')

const DEFAULT_CONFIG = {
  wifi_ssid: 'corelink-001',
  wifi_password: '9fK7qP2xL8vT4wR!3kD8mN5',
  beelink_ip: '10.0.0.1',
  rtmp_port: 1935,
  api_port: 8080,
  rtmp_url: 'rtmp://10.0.0.1:1935/live',
  // Routeur 4G (Cudy IR02) — réseau WiFi utilisé par les écrans externes
  router_wifi_ssid: 'corelink-screen',
  router_wifi_password: '4vR9!mQ2xK8sT7wP5nZ3',
  router_ip: '192.168.10.1',
  router_lan_ip: '192.168.10.10'
}

const DEFAULT_SETTINGS = {
  recording_enabled: true,
  external_rtmp_enabled: false,
  external_rtmp_url: 'rtmp://example.com/live/key'
}

const DEFAULT_STATE = {
  lastPilot: null,
  lastConnection: null
}

async function ensureConfigDir() {
  try {
    await fs.mkdir(CONFIG_PATH, { recursive: true })
  } catch (e) {}
}

async function getPilotsData() {
  await ensureConfigDir()
  try {
    const usersData = await fs.readFile(USERS_PATH, 'utf8')
    return JSON.parse(usersData)
  } catch (e) {
    return [
      { id: 1, name: 'Demonstration', unit: 'Mode Test', rtmp_key: 'demo' }
    ]
  }
}

router.get('/', async (req, res) => {
  // When mounted at /api/pilots, '/' must return the pilots list,
  // not the system config. This fixes the black-screen crash where
  // App.jsx received an object instead of an array and pilots.map failed.
  if (req.baseUrl && req.baseUrl.includes('/pilots')) {
    try {
      const users = await getPilotsData()
      return res.json(users)
    } catch (error) {
      console.error('Erreur pilotes:', error)
      return res.status(500).json({ error: 'Erreur lecture pilotes' })
    }
  }
  try {
    await ensureConfigDir()
    
    let state = { ...DEFAULT_STATE }
    try {
      const stateData = await fs.readFile(STATE_PATH, 'utf8')
      state = { ...DEFAULT_STATE, ...JSON.parse(stateData) }
    } catch (e) {}
    
    res.json({
      ...DEFAULT_CONFIG,
      ...state
    })
  } catch (error) {
    console.error('Erreur config:', error)
    res.status(500).json({ error: 'Erreur lecture config' })
  }
})

router.post('/last-pilot', async (req, res) => {
  try {
    const { pilotId } = req.body
    
    await ensureConfigDir()
    
    let state = DEFAULT_STATE
    try {
      const stateData = await fs.readFile(STATE_PATH, 'utf8')
      state = { ...DEFAULT_STATE, ...JSON.parse(stateData) }
    } catch (e) {}
    
    state.lastPilot = pilotId
    state.lastConnection = new Date().toISOString()
    
    await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2))
    
    res.json({ success: true, pilotId })
  } catch (error) {
    console.error('Erreur sauvegarde pilote:', error)
    res.status(500).json({ error: 'Erreur sauvegarde' })
  }
})

router.get('/pilots', async (req, res) => {
  try {
    const users = await getPilotsData()
    res.json(users)
  } catch (error) {
    console.error('Erreur pilotes:', error)
    res.status(500).json({ error: 'Erreur lecture pilotes' })
  }
})

router.get('/settings', async (req, res) => {
  try {
    await ensureConfigDir()
    let settings = { ...DEFAULT_SETTINGS }
    try {
      const data = await fs.readFile(SETTINGS_PATH, 'utf8')
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) }
    } catch {}
    res.json(settings)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/settings', async (req, res) => {
  try {
    await ensureConfigDir()
    let settings = { ...DEFAULT_SETTINGS }
    try {
      const data = await fs.readFile(SETTINGS_PATH, 'utf8')
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) }
    } catch {}
    const { recording_enabled, external_rtmp_enabled, external_rtmp_url } = req.body
    if (typeof recording_enabled === 'boolean') settings.recording_enabled = recording_enabled
    if (typeof external_rtmp_enabled === 'boolean') settings.external_rtmp_enabled = external_rtmp_enabled
    if (typeof external_rtmp_url === 'string') settings.external_rtmp_url = external_rtmp_url.trim()
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2))
    // Apply the change to the external RTMP push immediately (not on next poll)
    applySettingsNow()
    res.json(settings)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Debug endpoint for touch calibration - logs to server console/journal
router.post('/debug-touch', async (req, res) => {
  try {
    const data = req.body
    console.log('[TOUCH-DEBUG]', JSON.stringify(data))
    // also append to /tmp/touch-debug.log for easy tail
    try {
      const fsSync = await import('fs')
      fsSync.appendFileSync('/tmp/touch-debug.log', JSON.stringify({ ts: new Date().toISOString(), ...data }) + '\n')
    } catch (e) {}
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
