import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import videosRouter from './routes/videos.js'
import configRouter from './routes/config.js'
import batteryRouter from './routes/battery.js'
import { setupProxy } from './services/proxy.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 8080

app.use(express.json())
app.use(express.static(path.join(__dirname, '../../dist')))

app.use('/api/videos', videosRouter)
app.use('/api/config', configRouter)
app.use('/api/battery', batteryRouter)
app.use('/api/pilots', configRouter)

setupProxy(app)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../dist/index.html'))
})

app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err)
  res.status(500).json({ error: 'Erreur interne du serveur' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚁 DRONE OPS Suite démarrée sur http://0.0.0.0:${PORT}`)
})
