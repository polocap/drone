import { spawn } from 'child_process'
import path from 'path'

let recordingProcesses = new Map()

export function setupProxy(app) {
  app.all('/live/*', (req, res) => {
    const streamPath = req.params[0]
    const proxyUrl = `http://127.0.0.1:8888/live/${streamPath}`
    
    const proxyReq = require('http').request(
      proxyUrl,
      {
        method: req.method,
        headers: req.headers,
        path: req.path
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
      }
    )
    
    req.pipe(proxyReq)
    proxyReq.on('error', (e) => {
      console.error('Erreur proxy MediaMTX:', e)
      res.status(502).json({ error: 'Erreur proxy' })
    })
  })
  
  app.all('/stream/*', (req, res) => {
    const streamPath = req.params[0]
    const proxyUrl = `http://127.0.0.1:8889/stream/${streamPath}`
    
    const proxyReq = require('http').request(
      proxyUrl,
      {
        method: req.method,
        headers: req.headers,
        path: req.path
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
      }
    )
    
    req.pipe(proxyReq)
    proxyReq.on('error', (e) => {
      console.error('Erreur proxy WebRTC:', e)
      res.status(502).json({ error: 'Erreur proxy' })
    })
  })
}

export function startRecording(streamKey, outputDir = '/var/lib/drone/videos') {
  const today = new Date().toISOString().split('T')[0]
  const outputPath = path.join(outputDir, today)
  const filename = `${streamKey}_${new Date().toISOString().replace(/[:.]/g, '-')}.flv`
  const outputFile = path.join(outputPath, filename)
  
  const mkdir = spawn('mkdir', ['-p', outputPath])
  mkdir.on('close', (code) => {
    if (code !== 0) {
      console.error('Erreur création dossier')
      return
    }
    
    const ffmpeg = spawn('ffmpeg', [
      '-i', `rtmp://127.0.0.1:1935/live/${streamKey}`,
      '-c', 'copy',
      '-f', 'flv',
      '-y',
      outputFile
    ])
    
    ffmpeg.stderr.on('data', (data) => {
      console.log('FFmpeg:', data.toString())
    })
    
    ffmpeg.on('error', (e) => {
      recordingProcesses.delete(streamKey)
    })
    
    ffmpeg.on('close', (code) => {
      recordingProcesses.delete(streamKey)
      console.log('Enregistrement terminé:', streamKey)
    })
    
    recordingProcesses.set(streamKey, ffmpeg)
  })
}

export function stopRecording(streamKey) {
  const process = recordingProcesses.get(streamKey)
  if (process) {
    process.quit()
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
