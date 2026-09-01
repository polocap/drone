import { spawn } from 'child_process'
import path from 'path'
import http from 'http'

const recordingProcesses = new Map()
const RECONNECT_MAX_DELAY_MS = parseInt(process.env.RECONNECT_MAX_DELAY_MS) || 30000
const RTMP_TIMEOUT_MS = parseInt(process.env.RTMP_TIMEOUT_MS) || 10000
const FFMPEG_MAX_MEM_MB = parseInt(process.env.FFMPEG_MAX_MEM_MB) || 1024

export function setupProxy(app) {
  // WHEP / WebRTC via 8080 proxy — lets remote PCs on WiFi use WebRTC without opening 8889 directly
  // MediaMTX WHEP is POST http://<host>:8889/live/whep
  app.all('/live/whep', (req, res) => {
    const proxyUrl = `http://127.0.0.1:8889/live/whep`
    const proxyReq = http.request(
      proxyUrl,
      {
        method: req.method,
        headers: { ...req.headers, host: '127.0.0.1:8889' },
        timeout: RTMP_TIMEOUT_MS,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
      }
    )
    req.pipe(proxyReq)
    proxyReq.on('error', (e) => {
      console.error('Erreur proxy WHEP:', e)
      if (!res.headersSent) res.status(502).json({ error: 'Erreur proxy WHEP' })
    })
    proxyReq.on('timeout', () => {
      proxyReq.destroy()
      if (!res.headersSent) res.status(504).json({ error: 'Proxy timeout' })
    })
  })

  app.all('/live/*', (req, res) => {
    const streamPath = req.params[0]
    const proxyUrl = `http://127.0.0.1:8888/live/${streamPath}`
    
    const proxyReq = http.request(
      proxyUrl,
      {
        method: req.method,
        headers: req.headers,
        timeout: RTMP_TIMEOUT_MS
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
      }
    )
    
    req.pipe(proxyReq)
    proxyReq.on('error', (e) => {
      console.error('Erreur proxy MediaMTX:', e)
      if (!res.headersSent) {
        res.status(502).json({ error: 'Erreur proxy' })
      }
    })
    proxyReq.on('timeout', () => {
      proxyReq.destroy()
      if (!res.headersSent) {
        res.status(504).json({ error: 'Proxy timeout' })
      }
    })
  })
  
  app.all('/stream/*', (req, res) => {
    const streamPath = req.params[0]
    const proxyUrl = `http://127.0.0.1:8889/stream/${streamPath}`
    
    const proxyReq = http.request(
      proxyUrl,
      {
        method: req.method,
        headers: req.headers,
        timeout: RTMP_TIMEOUT_MS
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
      }
    )
    
    req.pipe(proxyReq)
    proxyReq.on('error', (e) => {
      console.error('Erreur proxy WebRTC:', e)
      if (!res.headersSent) {
        res.status(502).json({ error: 'Erreur proxy' })
      }
    })
    proxyReq.on('timeout', () => {
      proxyReq.destroy()
      if (!res.headersSent) {
        res.status(504).json({ error: 'Proxy timeout' })
      }
    })
  })
}

export function startRecording(streamKey, outputDir = '/var/lib/drone/videos') {
  if (recordingProcesses.has(streamKey)) {
    console.log('Enregistrement déjà en cours:', streamKey)
    return
  }
  
  const today = new Date().toISOString().split('T')[0]
  const outputPath = path.join(outputDir, today)
  const filename = `${streamKey}_${new Date().toISOString().replace(/[:.]/g, '-')}.flv`
  const outputFile = path.join(outputPath, filename)
  
  let retryCount = 0
  const maxRetries = 5
  
  const spawnFfmpeg = () => {
    const ffmpeg = spawn('ffmpeg', [
      '-timeout', String(RTMP_TIMEOUT_MS),
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '30',
      '-i', `rtmp://127.0.0.1:1935/live/${streamKey}`,
      
      '-fflags', 'nobuffer+fastseek+flush_packets+discardcorrupt',
      '-flags', 'low_delay',
      '-probesize', '32',
      '-analyzeduration', '0',
      '-sync', 'ext',
      
      '-framedrop', '1',
      
      '-thread_queue_size', '16',
      '-max_muxing_queue_size', '64',
      
      '-err_detect', 'ignore_err',
      '-ec', 'favor_inter',
      
      '-c', 'copy',
      '-f', 'flv',
      '-flvflags', 'no_duration_filesize',
      '-y', outputFile
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MALLOC_ARENA_MAX: '2'
      }
    })
    
    let lastErrorTime = 0
    const memMonitor = setInterval(() => {
      try {
        const usage = process.memoryUsage()
        if (usage.rss > FFMPEG_MAX_MEM_MB * 1024 * 1024) {
          console.warn(`Mémoire FFmpeg élevée: ${Math.round(usage.rss / 1024 / 1024)}MB pour ${streamKey}`)
        }
      } catch (e) {}
    }, 10000)
    
    ffmpeg.stderr.on('data', (data) => {
      const msg = data.toString()
      const now = Date.now()
      if ((msg.includes('error') || msg.includes('Error')) && now - lastErrorTime > 5000) {
        console.error('FFmpeg error:', msg.trim())
        lastErrorTime = now
      }
    })
    
    ffmpeg.on('error', (e) => {
      console.error('FFmpeg process error:', e)
      clearInterval(memMonitor)
      recordingProcesses.delete(streamKey)
    })
    
    ffmpeg.on('close', (code) => {
      clearInterval(memMonitor)
      recordingProcesses.delete(streamKey)
      
      if (code !== 0 && retryCount < maxRetries) {
        retryCount++
        const delay = Math.min(1000 * Math.pow(2, retryCount), RECONNECT_MAX_DELAY_MS)
        console.log(`Reconnexion FFmpeg dans ${delay}ms (tentative ${retryCount}/${maxRetries}) pour ${streamKey}`)
        setTimeout(spawnFfmpeg, delay)
      } else {
        console.log('Enregistrement terminé:', streamKey, 'code:', code)
      }
    })
    
    recordingProcesses.set(streamKey, ffmpeg)
  }
  
  const mkdir = spawn('mkdir', ['-p', outputPath])
  mkdir.on('error', (e) => {
    console.error('Erreur création dossier:', e)
  })
  mkdir.on('close', (code) => {
    if (code !== 0) {
      console.error('Erreur création dossier, code:', code)
      return
    }
    spawnFfmpeg()
  })
}

export function stopRecording(streamKey) {
  const proc = recordingProcesses.get(streamKey)
  if (!proc) return false
  
  recordingProcesses.delete(streamKey)
  
  return new Promise((resolve) => {
    const forceKillTimer = setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch (e) {}
      resolve(true)
    }, 5000)
    
    proc.on('exit', () => {
      clearTimeout(forceKillTimer)
      resolve(true)
    })
    
    if (proc.stdin?.writable) {
      try {
        proc.stdin.end('q')
      } catch (e) {
        proc.kill('SIGTERM')
      }
    } else {
      proc.kill('SIGTERM')
    }
  })
}

export function isRecording(streamKey) {
  return recordingProcesses.has(streamKey)
}

export function getAllRecordings() {
  return Array.from(recordingProcesses.keys())
}

function gracefulShutdown() {
  console.log('Arrêt gracieux des enregistrements...')
  
  const shutdownPromises = []
  
  for (const [key, proc] of recordingProcesses.entries()) {
    recordingProcesses.delete(key)
    
    const shutdownPromise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        try {
          proc.kill('SIGKILL')
        } catch (e) {}
        resolve()
      }, 5000)
      
      proc.on('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
      
      try {
        proc.kill('SIGTERM')
      } catch (e) {
        clearTimeout(timeout)
        resolve()
      }
    })
    
    shutdownPromises.push(shutdownPromise)
  }
  
  Promise.all(shutdownPromises).then(() => {
    console.log('Tous les enregistrements arrêtés')
    process.exit(0)
  }).catch(() => process.exit(1))
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)
process.on('uncaughtException', (err) => {
  console.error('Exception non gérée:', err)
  gracefulShutdown()
})
