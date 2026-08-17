import { spawn } from 'child_process'
import path from 'path'
import http from 'http'

const recordingProcesses = new Map()
const RECONNECT_MAX_DELAY_MS = parseInt(process.env.RECONNECT_MAX_DELAY_MS) || 30000
const RTMP_TIMEOUT_MS = parseInt(process.env.RTMP_TIMEOUT_MS) || 10000

export function setupProxy(app) {
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
      '-timeout', String(RTMP_TIMEOUT_MS * 1000),
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '30',
      '-i', `rtmp://127.0.0.1:1935/live/${streamKey}`,
      '-fflags', 'nobuffer+fastseek+flush_packets',
      '-flags', 'low_delay',
      '-probesize', '32',
      '-analyzeduration', '0',
      '-c', 'copy',
      '-f', 'flv',
      '-flvflags', 'no_duration_filesize',
      '-max_muxing_queue_size', '512',
      '-y',
      outputFile
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    
    ffmpeg.stderr.on('data', (data) => {
      const msg = data.toString()
      if (msg.includes('error') || msg.includes('Error')) {
        console.error('FFmpeg error:', msg)
      }
    })
    
    ffmpeg.on('error', (e) => {
      console.error('FFmpeg process error:', e)
      recordingProcesses.delete(streamKey)
    })
    
    ffmpeg.on('close', (code) => {
      recordingProcesses.delete(streamKey)
      
      if (code !== 0 && retryCount < maxRetries) {
        retryCount++
        const delay = Math.min(1000 * Math.pow(2, retryCount), RECONNECT_MAX_DELAY_MS)
        console.log(`Reconnexion FFmpeg dans ${delay}ms (tentative ${retryCount}/${maxRetries})`)
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
  const process = recordingProcesses.get(streamKey)
  if (process) {
    if (process.stdin.writable) {
      process.stdin.write('q')
      
      setTimeout(() => {
        if (recordingProcesses.has(streamKey)) {
          process.kill('SIGTERM')
          setTimeout(() => {
            if (recordingProcesses.has(streamKey)) {
              process.kill('SIGKILL')
              recordingProcesses.delete(streamKey)
            }
          }, 2000)
        }
      }, 3000)
    } else {
      process.kill('SIGTERM')
    }
    
    recordingProcesses.delete(streamKey)
    return true
  }
  return false
}

export function isRecording(streamKey) {
  return recordingProcesses.has(streamKey)
}

export function getAllRecordings() {
  return Array.from(recordingProcesses.keys())
}

process.on('SIGTERM', () => {
  console.log('Arrêt des enregistrements...')
  for (const [key, proc] of recordingProcesses.entries()) {
    proc.kill('SIGTERM')
  }
  recordingProcesses.clear()
})
