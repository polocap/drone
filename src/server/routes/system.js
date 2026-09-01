import express from 'express'
import { exec, execSync } from 'child_process'
import fs from 'fs/promises'
import http from 'http'
import path from 'path'

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

// ── WiFi password ──
// Changing the AP password requires root (the API runs as root via systemd).
// It is technically possible, but risky: a bad password or typo will disconnect
// all WiFi clients (drones, tablets) and require Ethernet recovery (192.168.100.1).
// We validate length and restart the AP with a confirmation step on the frontend.
const HOSTAPD_PATHS = ['/etc/hostapd/hostapd.conf', '/etc/hostapd/hostapd.conf.bak', '/etc/drone/hostapd.conf']
const DEFAULT_WIFI = { ssid: 'DRONE-OPS-001', password: 'drone2024' }

async function readWifiConfig() {
  for (const p of HOSTAPD_PATHS) {
    try {
      const txt = await fs.readFile(p, 'utf8')
      const ssid = (txt.match(/^\s*ssid\s*=\s*(.+)\s*$/m) || [])[1]?.trim()
      const pass = (txt.match(/^\s*wpa_passphrase\s*=\s*(.+)\s*$/m) || [])[1]?.trim()
      if (ssid || pass) return { ssid: ssid || DEFAULT_WIFI.ssid, password: pass || DEFAULT_WIFI.password, source: p }
    } catch {}
  }
  // fallback to NM or default
  try {
    const out = execSync('nmcli -t -f NAME,TYPE con show 2>/dev/null | grep -i wifi | head -1 | cut -d: -f1', { timeout: 2000 }).toString().trim()
    if (out) {
      const pass = execSync(`nmcli -s -g 802-11-wireless-security.psk con show "${out}" 2>/dev/null | head -1`, { timeout: 2000 }).toString().trim()
      const ssidNm = execSync(`nmcli -g 802-11-wireless.ssid con show "${out}" 2>/dev/null | head -1`, { timeout: 2000 }).toString().trim()
      if (ssidNm || pass) return { ssid: ssidNm || DEFAULT_WIFI.ssid, password: pass || DEFAULT_WIFI.password, source: `nmcli:${out}` }
    }
  } catch {}
  return { ...DEFAULT_WIFI, source: 'default' }
}

router.get('/wifi', async (req, res) => {
  try {
    const cfg = await readWifiConfig()
    res.json(cfg)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/wifi', async (req, res) => {
  try {
    const { password, ssid } = req.body
    if (typeof password !== 'string' || password.length < 8 || password.length > 63) {
      return res.status(400).json({ error: 'Mot de passe invalide: 8-63 caractères requis' })
    }
    if (/\s/.test(password)) return res.status(400).json({ error: 'Le mot de passe ne doit pas contenir d’espaces' })
    if (ssid !== undefined && typeof ssid === 'string' && ssid.trim() && !/^[a-zA-Z0-9_-]{2,32}$/.test(ssid.trim())) {
      return res.status(400).json({ error: 'SSID invalide' })
    }
    const newSsid = ssid && ssid.trim() ? ssid.trim() : null

    // Update hostapd.conf files if they exist
    let updated = []
    for (const p of HOSTAPD_PATHS) {
      try {
        let txt = await fs.readFile(p, 'utf8')
        let changed = false
        if (newSsid && txt.includes('ssid=')) { txt = txt.replace(/^(ssid\s*=).*/m, `$1${newSsid}`); changed = true }
        if (txt.includes('wpa_passphrase')) { txt = txt.replace(/^(wpa_passphrase\s*=).*/m, `$1${password}`); changed = true }
        if (changed) { await fs.writeFile(p, txt); updated.push(p) }
      } catch {}
    }
    // Ensure at least one hostapd.conf exists
    if (updated.length === 0) {
      try {
        const base = HOSTAPD_PATHS[0]
        await fs.mkdir(path.dirname(base), { recursive: true })
        let txt = `interface=wlp2s0\ndriver=nl80211\nssid=${newSsid || DEFAULT_WIFI.ssid}\nhw_mode=g\nchannel=6\nieee80211n=1\nwmm_enabled=1\nht_capab=[HT40+][SHORT-GI-20][DSSS_CCK-40]\nauth_algs=1\nwpa=2\nwpa_key_mgmt=WPA-PSK\nrsn_pairwise=CCMP\nwpa_passphrase=${password}\n`
        await fs.writeFile(base, txt)
        updated.push(base)
      } catch {}
    }

    // Try to update NetworkManager hotspot if present (more common on Beelink)
    let nmUpdated = false
    try {
      const list = execSync('nmcli -t -f NAME,TYPE con show 2>/dev/null | grep ":wifi" | cut -d: -f1', { timeout: 2000 }).toString().split('\n').map(s=>s.trim()).filter(Boolean)
      for (const con of list) {
        try {
          execSync(`nmcli con modify "${con}" wifi-sec.psk "${password.replace(/"/g, '\\"')}" 2>&1`, { timeout: 3000 })
          if (newSsid) execSync(`nmcli con modify "${con}" 802-11-wireless.ssid "${newSsid}" 2>&1`, { timeout: 2000 })
          nmUpdated = true
        } catch {}
      }
      if (list.length > 0) {
        try { execSync('nmcli con down "DRONE-OPS-AP" 2>/dev/null; nmcli con up "DRONE-OPS-AP" 2>/dev/null &', { timeout: 4000 }) } catch {}
      }
    } catch {}

    // Restart hostapd if running, otherwise try drone-wifi-ap service
    setTimeout(() => {
      exec('systemctl restart hostapd 2>/dev/null; systemctl restart drone-wifi-ap 2>/dev/null; pkill -HUP hostapd 2>/dev/null; nmcli con up "DRONE-OPS-AP" 2>/dev/null &', () => {})
    }, 500)

    res.json({ ok: true, updated, nmUpdated, ssid: newSsid || undefined, password: '***' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

export default router
