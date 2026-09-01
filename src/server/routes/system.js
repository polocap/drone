import express from 'express'
import { exec } from 'child_process'
import http from 'http'

const router = express.Router()

router.get('/status', async (req, res) => {
  let wifi = false
  let rtmp = false
  let rtmpState = false

  // WiFi check: hostapd or ip 10.0.0.1 present, or dnsmasq lease file exists
  try {
    // Quick: check if we can reach MediaMTX HLS (rtmp health)
    await new Promise((resolve) => {
      const r = http.get('http://127.0.0.1:8888/live/index.m3u8', { timeout: 1500 }, (pr) => {
        rtmpState = pr.statusCode < 500
        pr.destroy()
        resolve()
      })
      r.on('error', () => resolve())
      r.on('timeout', () => { r.destroy(); resolve() })
      r.setTimeout(1500, () => { try{ r.destroy() }catch{}; resolve() })
    })
  } catch {}

  // For WiFi: assume up if we are serving (we are answering this request via WiFi AP)
  // Try to check hostapd via systemctl or ip addr
  try {
    const { execSync } = await import('child_process')
    try {
      const out = execSync('ip addr show 2>/dev/null | grep -q "10.0.0.1" && echo ok || echo no', { timeout: 1000 }).toString()
      wifi = out.includes('ok')
    } catch { wifi = true }
  } catch { wifi = true }

  // RTMP: if MediaMTX responds, consider green; if not, red
  // Distinguish degraded if HLS returns 404 (no publisher yet) vs 200
  let rtmpStatus = false
  let rtmpDegraded = false
  try {
    await new Promise((resolve) => {
      const r = http.get('http://127.0.0.1:8888/live/index.m3u8', { timeout: 1500 }, (pr) => {
        if (pr.statusCode === 200) rtmpStatus = true
        else if (pr.statusCode === 404) { rtmpStatus = true; rtmpDegraded = true }
        pr.destroy()
        resolve()
      })
      r.on('error', () => resolve())
      r.setTimeout(1500, () => { try{ r.destroy() }catch{}; resolve() })
    })
  } catch {}

  res.json({
    wifi,
    rtmp: rtmpStatus ? (rtmpDegraded ? 'degraded' : true) : false,
    rtmp_degraded: rtmpDegraded,
    timestamp: new Date().toISOString(),
  })
})

router.post('/shutdown', (req, res) => {
  res.json({ ok: true, message: 'Shutting down...' })
  // Delay to let response flush
  setTimeout(() => {
    exec('shutdown -h now 2>/dev/null || poweroff 2>/dev/null || systemctl poweroff 2>/dev/null || halt -p 2>/dev/null', (err) => {
      if (err) console.error('Shutdown failed:', err.message)
    })
  }, 500)
})

router.post('/reboot', (req, res) => {
  res.json({ ok: true, message: 'Rebooting...' })
  setTimeout(() => {
    exec('reboot 2>/dev/null || systemctl reboot 2>/dev/null', (err) => {
      if (err) console.error('Reboot failed:', err.message)
    })
  }, 500)
})

export default router
