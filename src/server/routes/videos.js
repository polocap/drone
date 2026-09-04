import express from 'express'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const VIDEOS_DIR = process.env.VIDEOS_DIR || '/var/lib/drone/videos'

router.get('/', async (req, res) => {
  try {
    const dates = await fs.readdir(VIDEOS_DIR)
    const videos = []

    for (const dateDir of dates) {
      const datePath = path.join(VIDEOS_DIR, dateDir)
      const stat = await fs.stat(datePath)

      if (stat.isDirectory()) {
        // recursive: per-drone recordings nest under a session subdir
        // (recordPath contains %path, e.g. "..._live/UAS-FR-140453.mp4")
        const entries = await fs.readdir(datePath, { recursive: true })

        for (const rel of entries) {
          if (!/\.(flv|mp4)$/i.test(rel)) continue
          const filePath = path.join(datePath, rel)
          const fileStat = await fs.stat(filePath)
          if (!fileStat.isFile()) continue

          videos.push({
            filename: rel,
            date: dateDir,
            path: `${dateDir}/${rel}`,
            size: fileStat.size,
            sizeMB: Math.round(fileStat.size / 1024 / 1024 * 10) / 10,
            created: fileStat.birthtime
          })
        }
      }
    }

    videos.sort((a, b) => b.created - a.created)

    res.json(videos)
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.json([])
    } else {
      console.error('Erreur liste vidéos:', error)
      res.status(500).json({ error: 'Erreur lecture vidéos' })
    }
  }
})

router.get('/download/*', async (req, res) => {
  try {
    const rel = req.params[0] || ''
    if (rel.includes('..')) return res.status(400).json({ error: 'Chemin invalide' })

    const base = path.resolve(VIDEOS_DIR)
    const filePath = path.resolve(base, rel)
    if (!filePath.startsWith(base + path.sep)) return res.status(400).json({ error: 'Chemin invalide' })

    await fs.access(filePath)
    res.download(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Vidéo non trouvée' })
    } else {
      res.status(500).json({ error: 'Erreur téléchargement' })
    }
  }
})

router.delete('/cleanup', async (req, res) => {
  try {
    const days = req.body.days || 7
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    
    const dates = await fs.readdir(VIDEOS_DIR)
    let deleted = 0
    
    for (const dateDir of dates) {
      const datePath = path.join(VIDEOS_DIR, dateDir)
      const stat = await fs.stat(datePath)
      
      if (stat.isDirectory()) {
        const dirDate = new Date(dateDir)
        
        if (dirDate < cutoffDate) {
          await fs.rm(datePath, { recursive: true })
          deleted++
          console.log(`🗑️ Supprimé: ${dateDir}`)
        }
      }
    }
    
    res.json({ deleted, message: `${deleted} dossier(s) supprimé(s)` })
  } catch (error) {
    console.error('Erreur nettoyage:', error)
    res.status(500).json({ error: 'Erreur nettoyage' })
  }
})

router.get('/stats', async (req, res) => {
  try {
    const dates = await fs.readdir(VIDEOS_DIR)
    let totalSize = 0
    let totalFiles = 0
    let daysCount = 0
    
    for (const dateDir of dates) {
      const datePath = path.join(VIDEOS_DIR, dateDir)
      const stat = await fs.stat(datePath)
      
      if (stat.isDirectory()) {
        daysCount++
        const files = await fs.readdir(datePath)
        
        for (const file of files) {
          if (file.endsWith('.flv') || file.endsWith('.mp4')) {
            const filePath = path.join(datePath, file)
            const fileStat = await fs.stat(filePath)
            totalSize += fileStat.size
            totalFiles++
          }
        }
      }
    }
    
    res.json({
      daysCount,
      totalFiles,
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 10) / 10,
      totalSizeGB: Math.round(totalSize / 1024 / 1024 / 1024 * 10) / 10
    })
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.json({ daysCount: 0, totalFiles: 0, totalSizeMB: 0, totalSizeGB: 0 })
    } else {
      res.status(500).json({ error: 'Erreur stats' })
    }
  }
})

export default router
