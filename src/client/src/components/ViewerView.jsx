import { useState, useEffect, useCallback } from 'react'
import StreamPlayer from './StreamPlayer'
import { Ring } from './loading-ui/ring'

// Vue réservée aux écrans externes (tablettes/PC sur le WiFi routeur).
// Accès via http://<beelink>:8080/?viewer — lecture seule : heure, flux,
// état, qualité réseau et vidéos enregistrées. Pas de réglages, pas de PIN.

function formatParisTime(date) {
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  })
}

function StatusDot({ state }) {
  return <span className={`s-dot s-dot--${state}`} />
}

function parseVideoLabel(v) {
  // path: "2026-09-04/2026-09-04_09-30-29_live.mp4"
  //    ou "2026-09-04/2026-09-04_09-30-29_live/UAS-FR-140453.mp4"
  const m = v.path.match(/^(\d{4})-(\d{2})-(\d{2})\/\d{4}-\d{2}-\d{2}_(\d{2})-(\d{2})-(\d{2})_(.+?)(?:\.mp4|\.flv)?$/i)
  if (!m) return { label: v.filename, drone: null }
  const [, y, mo, d, hh, mm, ss, stream] = m
  const droneId = stream.startsWith('live/') ? stream.slice(5) : null
  const drone = droneId ? `Drone ${droneId}` : (stream === 'drone' ? 'Flux drone' : 'Flux générique')
  return { label: `${d}/${mo}/${y} ${hh}:${mm}:${ss}`, drone }
}

function ViewerInfoModal({ open, onClose }) {
  const [status, setStatus] = useState(null)
  const [conn, setConn] = useState(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function tick() {
      try {
        const r = await fetch('/api/system/status')
        const d = await r.json()
        if (!cancelled) setStatus(d)
      } catch {}
      const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection
      if (c) {
        setConn({
          downlink: c.downlink,
          rtt: c.rtt,
          type: c.effectiveType,
        })
      }
    }
    tick()
    const iv = setInterval(tick, 3000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [open])

  if (!open) return null

  const feedState = status ? (status.rtmp === true ? 'green' : 'yellow') : 'yellow'
  const fourGState = status ? (status.internet ? 'green' : status.router ? 'yellow' : 'red') : 'yellow'
  const fourGLabel = status
    ? status.internet ? 'Disponible' : status.router ? 'Routeur OK — pas d\'Internet' : 'Non disponible'
    : 'Vérification…'
  const push = status?.external_rtmp
  const pushLabel = !push ? 'Vérification…'
    : !push.enabled ? 'Désactivée'
    : push.active ? 'Active'
    : push.last_error ? 'Erreur' : 'En attente'
  const pushState = !push ? 'yellow'
    : !push.enabled ? 'yellow'
    : push.active ? 'green'
    : push.last_error ? 'red' : 'yellow'

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-glass" onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3 className="sheet-title">Informations</h3>

        <div className="sheet-section">
          <span className="sheet-section-label">Qualité réseau (cet appareil)</span>
          <div className="info-card">
            <div className="info-card-row">
              <span className="info-card-k">Débit estimé</span>
              <span className="info-card-v mono">{conn ? `${conn.downlink ?? '?'} Mbps` : '—'}</span>
            </div>
            <div className="info-card-row">
              <span className="info-card-k">Latence (RTT)</span>
              <span className="info-card-v mono">{conn ? `${conn.rtt ?? '?'} ms` : '—'}</span>
            </div>
            <div className="info-card-row">
              <span className="info-card-k">Type de connexion</span>
              <span className="info-card-v mono">{conn?.type ?? '—'}</span>
            </div>
          </div>
          <p className="info-hint">Si le flux saccade, rapprochez-vous du routeur ou vérifiez le WiFi de cet appareil (débit faible / latence élevée = signal WiFi insuffisant).</p>
        </div>

        <div className="sheet-section">
          <span className="sheet-section-label">État du système</span>
          <div className="status-list">
            <div className="status-row">
              <span className="status-row-label">Flux drone</span>
              <span className="status-row-value">
                <StatusDot state={feedState} />
                {status?.rtmp === true ? 'En direct' : 'En attente'}
              </span>
            </div>
            <div className="status-row">
              <span className="status-row-label">4G</span>
              <span className="status-row-value">
                <StatusDot state={fourGState} />
                {fourGLabel}
              </span>
            </div>
            <div className="status-row">
              <span className="status-row-label">Retransmission</span>
              <span className="status-row-value">
                <StatusDot state={pushState} />
                {pushLabel}
              </span>
            </div>
          </div>
        </div>

        <button className="sheet-btn sheet-btn--ghost sheet-btn--full" onClick={onClose}>Fermer</button>
      </div>
    </div>
  )
}

function ViewerVideosModal({ open, onClose }) {
  const [videos, setVideos] = useState(null)
  const [error, setError] = useState(null)

  async function load() {
    try {
      const r = await fetch('/api/videos')
      const d = await r.json()
      setVideos(Array.isArray(d) ? d : [])
      setError(null)
    } catch {
      setError('Impossible de charger les vidéos')
    }
  }

  useEffect(() => {
    if (!open) return
    setVideos(null)
    load()
  }, [open])

  if (!open) return null

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-glass" onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3 className="sheet-title">Vidéos enregistrées</h3>

        <div className="sheet-section">
          {error && <p className="info-hint">{error}</p>}
          {!error && videos === null && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <Ring className="waiting-ring" />
            </div>
          )}
          {Array.isArray(videos) && videos.length === 0 && (
            <p className="info-hint">Aucune vidéo enregistrée pour le moment. Les vols apparaissent ici automatiquement (conservés 7 jours).</p>
          )}
          {Array.isArray(videos) && videos.length > 0 && (
            <div style={{ maxHeight: '42vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {videos.map((v) => {
                const info = parseVideoLabel(v)
                const dl = `/api/videos/download/${encodeURI(v.path)}`
                return (
                  <div key={v.path} className="info-card" style={{ padding: '10px 12px' }}>
                    <div className="info-card-row">
                      <span className="info-card-k">{info.label}</span>
                      <span className="info-card-v mono">{v.sizeMB} Mo</span>
                    </div>
                    <div className="info-card-row">
                      <span className="info-card-k">{info.drone}</span>
                      <a
                        href={dl}
                        download
                        className="sheet-btn sheet-btn--primary"
                        style={{ padding: '6px 14px', fontSize: '0.8rem', textDecoration: 'none' }}
                      >
                        Télécharger
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <button className="sheet-btn sheet-btn--ghost sheet-btn--full" onClick={onClose}>Fermer</button>
      </div>
    </div>
  )
}

function ViewerView() {
  const [now, setNow] = useState(new Date())
  const [isConnected, setIsConnected] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showVideos, setShowVideos] = useState(false)
  const [activeDrone, setActiveDrone] = useState(null)

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const r = await fetch('/api/drones/active')
        const d = await r.json()
        if (cancelled) return
        if (d.active && d.active.length > 0) {
          const withId = d.active.find(a => a.droneId || a.id)
          setActiveDrone(withId || d.active[0])
        } else {
          setActiveDrone(null)
        }
      } catch { if (!cancelled) setActiveDrone(null) }
    }
    poll()
    const iv = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  const streamUrl = activeDrone?.droneId
    ? `/live/${encodeURIComponent(activeDrone.droneId)}/index.m3u8`
    : '/live/index.m3u8'

  const handleStreamStatus = useCallback((status) => {
    setIsConnected(status === 'connected')
  }, [])

  return (
    <div className="live-container">
      <header className="live-topbar">
        <span className="live-time">{formatParisTime(now)}</span>
      </header>

      <main className="stream-container">
        <StreamPlayer streamUrl={streamUrl} onStatusChange={handleStreamStatus} />
        {!isConnected && (
          <div className="waiting-overlay">
            <div className="waiting-content">
              <h2>En attente du flux</h2>
              <p>Le drone n'est pas encore en vol</p>
            </div>
            <div className="waiting-ring-wrap" aria-hidden="true">
              <Ring className="waiting-ring" />
            </div>
          </div>
        )}
      </main>

      <nav className="dock" aria-label="Menu">
        <button className="dock-item" onClick={()=>{}} aria-label="État connexion">
          <StatusDot state={isConnected ? 'green' : 'red'} />
          <span className="dock-label">{isConnected ? 'En direct' : 'Indisponible…'}</span>
        </button>

        <button className="dock-item dock-item--icon" onClick={()=>setShowInfo(true)} aria-label="Informations">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 11v5" />
            <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
          </svg>
          <span className="dock-label-sm">Infos</span>
        </button>

        <button className="dock-item dock-item--icon" onClick={()=>setShowVideos(true)} aria-label="Vidéos">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="13" height="14" rx="2" />
            <path d="M16 10l5-3v10l-5-3" />
          </svg>
          <span className="dock-label-sm">Vidéos</span>
        </button>
      </nav>

      <ViewerInfoModal open={showInfo} onClose={()=>setShowInfo(false)} />
      <ViewerVideosModal open={showVideos} onClose={()=>setShowVideos(false)} />
    </div>
  )
}

export default ViewerView
