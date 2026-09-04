import express from 'express'
import { exec } from 'child_process'
import http from 'http'
import net from 'net'
import os from 'os'
import fsSync from 'fs'
import { getPushStatus, loadSettings } from '../services/rtmp-push.js'

const router = express.Router()

// Default route -> which interface/gateway leads to the internet (the 4G
// router once the Beelink is wired to it).
function defaultRoute() {
  try {
    const text = fsSync.readFileSync('/proc/net/route', 'utf8')
    for (const line of text.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/)
      if (cols.length < 9 || cols[1] !== '00000000') continue
      const iface = cols[0]
      const bytes = cols[2].match(/../g).map((h) => parseInt(h, 16))
      const gateway = `${bytes[3]}.${bytes[2]}.${bytes[1]}.${bytes[0]}`
      return { iface, gateway }
    }
  } catch {}
  return null
}

function lanIp(iface, gateway) {
  try {
    const addrs = os.networkInterfaces()[iface] || []
    const ipv4 = addrs.filter((a) => !a.internal && a.family === 'IPv4')
    if (!ipv4.length) return null
    if (gateway) {
      // Prefer the address in the same subnet as the gateway (the router LAN)
      const inSubnet = ipv4.find((a) => {
        const mask = a.netmask
          .split('.')
          .map((x, i) => (parseInt(x) & parseInt(gateway.split('.')[i])) === (parseInt(a.address.split('.')[i]) & parseInt(gateway.split('.')[i])))
        return mask.every(Boolean)
      })
      if (inSubnet) return inSubnet.address
    }
    return ipv4[0].address
  } catch {
    return null
  }
}

// TCP reachability probe (no external dependency, works behind the 4G NAT)
function tcpProbe(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (ok) => {
      try { socket.destroy() } catch {}
      resolve(ok)
    }
    socket.setTimeout(timeout, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

async function probeFirst(host, ports) {
  for (const port of ports) {
    if (await tcpProbe(host, port)) return true
  }
  return false
}

// CPU temperature from the thermal zones (N100: x86_pkg_temp is the
// package sensor; fallback to the hottest zone available)
function readCpuTemp() {
  try {
    const base = '/sys/class/thermal'
    const zones = fsSync.readdirSync(base).filter((d) => d.startsWith('thermal_zone'))
    let best = null
    for (const zone of zones) {
      try {
        const type = fsSync.readFileSync(`${base}/${zone}/type`, 'utf8').trim()
        const temp = parseInt(fsSync.readFileSync(`${base}/${zone}/temp`, 'utf8').trim(), 10) / 1000
        if (!Number.isFinite(temp)) continue
        const prio = /x86_pkg_temp/i.test(type) ? 2 : /coretemp|cpu/i.test(type) ? 1 : 0
        if (!best || prio > best.prio) best = { prio, temp, type }
      } catch {}
    }
    return best ? Math.round(best.temp * 10) / 10 : null
  } catch {
    return null
  }
}

function checkLocalHls() {
  return new Promise((resolve) => {
    const r = http.get('http://127.0.0.1:8888/live/index.m3u8', { timeout: 1500 }, (pr) => {
      resolve({ code: pr.statusCode })
      pr.destroy()
    })
    r.on('error', () => resolve({ code: 0 }))
    r.on('timeout', () => { try { r.destroy() } catch {}; resolve({ code: 0 }) })
    r.setTimeout(1500, () => { try { r.destroy() } catch {}; resolve({ code: 0 }) })
  })
}

router.get('/status', async (req, res) => {
  let wifi = false

  // For WiFi AP: assume up if we are serving (we are answering this request
  // via WiFi AP), or if the AP IP is present on an interface
  try {
    const { execSync } = await import('child_process')
    try {
      const out = execSync('ip addr show 2>/dev/null | grep -q "10.0.0.1" && echo ok || echo no', { timeout: 1000 }).toString()
      wifi = out.includes('ok')
    } catch { wifi = true }
  } catch { wifi = true }

  // RTMP: MediaMTX HLS answering -> green; 404 (no publisher yet) -> degraded
  const hls = await checkLocalHls()
  const rtmpStatus = hls.code === 200 || hls.code === 404
  const rtmpDegraded = hls.code === 404

  // Router (wired gateway) + internet (4G data) reachability
  const route = defaultRoute()
  const gateway = route?.gateway || null
  const routerUp = gateway ? await probeFirst(gateway, [53, 80]) : false
  const internetUp = routerUp ? (await probeFirst('1.1.1.1', [53]) || await probeFirst('8.8.8.8', [53])) : false

  const pushRuntime = getPushStatus()
  const pushSettings = await loadSettings()

  // CPU temperature (°C) — beelink in a closed case: warn early
  const cpuTemp = readCpuTemp()
  const tempState = cpuTemp == null ? 'unknown' : cpuTemp >= 85 ? 'hot' : cpuTemp >= 75 ? 'warm' : 'ok'

  res.json({
    wifi,
    rtmp: rtmpStatus ? (rtmpDegraded ? 'degraded' : true) : false,
    rtmp_degraded: rtmpDegraded,
    router: routerUp,
    internet: internetUp,
    lan: {
      iface: route?.iface || null,
      ip: route ? lanIp(route.iface, gateway) : null,
      gateway,
    },
    temp: { cpu: cpuTemp, state: tempState },
    external_rtmp: {
      enabled: pushSettings.enabled,
      url: pushSettings.url,
      active: pushRuntime.active,
      stream: pushRuntime.stream,
      last_error: pushRuntime.active ? null : pushRuntime.last_error,
    },
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
