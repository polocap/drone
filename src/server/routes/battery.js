import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CONFIG_PATH = process.env.CONFIG_PATH || '/etc/drone'
const BATTERY_STATE_PATH = path.join(CONFIG_PATH, 'battery_state.json')

const BATTERY_CAPACITY_WH = 99
const BEELINK_CONSUMPTION_W = 15
const SCREEN_CONSUMPTION_W = 20
const TOTAL_CONSUMPTION_W = BEELINK_CONSUMPTION_W + SCREEN_CONSUMPTION_W
const ESTIMATED_RUNTIME_MINUTES = Math.round((BATTERY_CAPACITY_WH / TOTAL_CONSUMPTION_W) * 60)

let startTime = null

router.get('/', async (req, res) => {
  try {
    const batteryInfo = await getEstimatedBattery()
    res.json(batteryInfo)
  } catch (error) {
    console.error('Erreur batterie:', error)
    res.json({
      percent: 100,
      remaining: ESTIMATED_RUNTIME_MINUTES,
      charging: false,
      status: 'estimation',
      mode: 'estimated'
    })
  }
})

router.post('/start', async (req, res) => {
  startTime = new Date()
  await saveBatteryState(100, ESTIMATED_RUNTIME_MINUTES)
  res.json({ success: true, startTime: startTime.toISOString() })
})

router.post('/update', async (req, res) => {
  const { timeElapsedMinutes } = req.body
  await updateBatteryEstimate(timeElapsedMinutes || 0)
  res.json({ success: true })
})

async function getEstimatedBattery() {
  if (!startTime) {
    await loadBatteryState()
  }
  
  if (!startTime) {
    return {
      percent: 100,
      remaining: ESTIMATED_RUNTIME_MINUTES,
      charging: false,
      status: 'estimation',
      mode: 'estimated',
      note: 'Initialiser avec POST /api/battery/start'
    }
  }
  
  const now = new Date()
  const elapsedMs = now - startTime
  const elapsedMinutes = Math.round(elapsedMs / 1000 / 60)
  
  const consumedPercent = (elapsedMinutes / ESTIMATED_RUNTIME_MINUTES) * 100
  const currentPercent = Math.max(5, Math.round(100 - consumedPercent))
  const remainingMinutes = Math.max(0, Math.round(ESTIMATED_RUNTIME_MINUTES - elapsedMinutes))
  
  return {
    percent: currentPercent,
    remaining: remainingMinutes,
    charging: false,
    status: 'discharging',
    mode: 'estimated',
    elapsedMinutes,
    totalCapacity: `${BATTERY_CAPACITY_WH} Wh`,
    consumption: `${TOTAL_CONSUMPTION_W} W`,
    maxRuntime: `${ESTIMATED_RUNTIME_MINUTES} min`
  }
}

async function loadBatteryState() {
  try {
    const data = await fs.readFile(BATTERY_STATE_PATH, 'utf8')
    const state = JSON.parse(data)
    if (state.startTime) {
      startTime = new Date(state.startTime)
    }
  } catch (e) {}
}

async function saveBatteryState(percent, remaining) {
  try {
    await fs.mkdir(CONFIG_PATH, { recursive: true })
    await fs.writeFile(BATTERY_STATE_PATH, JSON.stringify({
      startTime: startTime.toISOString(),
      percent,
      remaining,
      timestamp: new Date().toISOString()
    }, null, 2))
  } catch (e) {
    console.error('Erreur sauvegarde état batterie:', e)
  }
}

async function updateBatteryEstimate(timeElapsedMinutes) {
  return loadBatteryState()
}

export default router
