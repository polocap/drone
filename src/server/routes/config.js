import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CONFIG_PATH = process.env.CONFIG_PATH || '/etc/drone'
const USERS_PATH = path.join(CONFIG_PATH, 'users.json')
const STATE_PATH = path.join(CONFIG_PATH, 'state.json')

const DEFAULT_CONFIG = {
  wifi_ssid: 'DRONE-OPS-001',
  wifi_password: 'drone2024',
  beelink_ip: '10.0.0.1',
  rtmp_port: 1935,
  api_port: 8080,
  rtmp_url: 'rtmp://10.0.0.1:1935/live/stream'
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

export default router
