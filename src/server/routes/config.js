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

router.get('/', async (req, res) => {
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
    await ensureConfigDir()
    
    let users = []
    try {
      const usersData = await fs.readFile(USERS_PATH, 'utf8')
      users = JSON.parse(usersData)
    } catch (e) {
      users = [
        { id: 1, name: 'Demonstration', unit: 'Mode Test', rtmp_key: 'demo' }
      ]
    }
    
    res.json(users)
  } catch (error) {
    console.error('Erreur pilotes:', error)
    res.status(500).json({ error: 'Erreur lecture pilotes' })
  }
})

export default router
