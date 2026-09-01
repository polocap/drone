import { useState, useEffect, useCallback } from 'react'
import StreamPlayer from './StreamPlayer'
import ConfirmModal from './ConfirmModal'
import { Ring } from './loading-ui/ring'
import { getStreamUrl } from '../api'
import './LiveView.css'

function formatParisTime(date) {
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  })
}

function StatusDot({ state }) {
  // state: 'green' | 'red' | 'yellow'
  return <span className={`s-dot s-dot--${state}`} />
}

function getDroneStreamUrl(droneId) {
  if (droneId) return `/live/${encodeURIComponent(droneId)}/index.m3u8`
  return getStreamUrl()
}

function SettingsModal({ open, onClose, config }) {
  const [recording, setRecording] = useState(true)
  const [externalEnabled, setExternalEnabled] = useState(false)
  const [rtmpUrl, setRtmpUrl] = useState(config?.rtmp_url || 'rtmp://10.0.0.1:1935/live')

  // load saved settings
  useEffect(() => {
    if (!open) return
    fetch('/api/config/settings').then(r=>r.json()).then(d=>{
      if (d.recording_enabled !== undefined) setRecording(d.recording_enabled)
      if (d.external_rtmp_enabled !== undefined) setExternalEnabled(d.external_rtmp_enabled)
      if (d.external_rtmp_url) setRtmpUrl(d.external_rtmp_url)
    }).catch(()=>{})
  }, [open])

  const handleSave = async () => {
    try {
      await fetch('/api/config/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recording_enabled: recording,
          external_rtmp_enabled: externalEnabled,
          external_rtmp_url: rtmpUrl,
        })
      })
    } catch {}
    onClose()
  }

  if (!open) return null
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-glass" onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3 className="sheet-title">Réglages</h3>

        <div className="sheet-section">
          <label className="sheet-row">
            <div className="sheet-row-label">
              <span className="sheet-row-title">Enregistrement</span>
              <span className="sheet-row-sub">Sauvegarder le flux localement</span>
            </div>
            <button
              className={`toggle ${recording ? 'toggle--on' : ''}`}
              onClick={()=>setRecording(v=>!v)}
              aria-label="Enregistrement"
            >
              <span className="toggle-knob" />
            </button>
          </label>

          <label className="sheet-row">
            <div className="sheet-row-label">
              <span className="sheet-row-title">Serveur externe</span>
              <span className="sheet-row-sub">Retransmettre vers un RTMP distant</span>
            </div>
            <button
              className={`toggle ${externalEnabled ? 'toggle--on' : ''}`}
              onClick={()=>setExternalEnabled(v=>!v)}
              aria-label="Serveur externe"
            >
              <span className="toggle-knob" />
            </button>
          </label>

          {externalEnabled && (
            <div className="sheet-field">
              <span className="sheet-field-label">Lien RTMP distant</span>
              <input
                className="sheet-input"
                value={rtmpUrl}
                onChange={e=>setRtmpUrl(e.target.value)}
                placeholder="rtmp://exemple.com/live/cle"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        <div className="sheet-actions">
          <button className="sheet-btn sheet-btn--ghost" onClick={onClose}>Annuler</button>
          <button className="sheet-btn sheet-btn--primary" onClick={handleSave}>Enregistrer</button>
        </div>
      </div>
    </div>
  )
}

function InfoModal({ open, onClose, config, isConnected }) {
  const [status, setStatus] = useState({ wifi: 'loading' })

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function fetchStatus() {
      try {
        const r = await fetch('/api/system/status')
        const d = await r.json()
        if (!cancelled) setStatus({ wifi: d.wifi ? 'green' : 'red' })
      } catch {
        if (!cancelled) setStatus({ wifi: 'yellow' })
      }
    }
    fetchStatus()
    const iv = setInterval(fetchStatus, 3000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [open])

  if (!open) return null
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-glass" onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3 className="sheet-title">Informations</h3>

        <div className="sheet-section">
          <span className="sheet-section-label">État du système</span>
          <div className="status-list">
            <div className="status-row">
              <span className="status-row-label">WiFi</span>
              <span className="status-row-value">
                <StatusDot state={status.wifi} />
                {status.wifi === 'green' ? 'Actif' : status.wifi === 'red' ? 'Inactif' : 'Vérification…'}
              </span>
            </div>
            <div className="status-row">
              <span className="status-row-label">Flux drone</span>
              <span className="status-row-value">
                <StatusDot state={isConnected ? 'green' : 'yellow'} />
                {isConnected ? 'Connecté' : 'En attente'}
              </span>
            </div>
            <div className="status-row">
              <span className="status-row-label">4G</span>
              <span className="status-row-value">
                <StatusDot state="red" />
                Non disponible
              </span>
            </div>
          </div>
        </div>

        <div className="sheet-section">
          <span className="sheet-section-label">Connexion WiFi</span>
          <div className="info-card">
            <div className="info-card-row">
              <span className="info-card-k">Réseau</span>
              <span className="info-card-v mono">{config?.wifi_ssid || 'corelink-001'}</span>
            </div>
            <div className="info-card-row">
              <span className="info-card-k">Mot de passe</span>
              <span className="info-card-v mono">{config?.wifi_password || '9fK7qP2xL8vT4wR!3kD8mN5'}</span>
            </div>
          </div>
        </div>

        <div className="sheet-section">
          <span className="sheet-section-label">Transmission vers autres écrans</span>
          <div className="info-card">
            <div className="info-card-row">
              <span className="info-card-k">Flux RTMP générique</span>
              <span className="info-card-v mono">rtmp://{config?.beelink_ip || '10.0.0.1'}:1935/live</span>
            </div>
            <div className="info-card-row">
              <span className="info-card-k">Flux RTMP par drone</span>
              <span className="info-card-v mono">rtmp://{config?.beelink_ip || '10.0.0.1'}:1935/live/[drone_id]</span>
            </div>
            <div className="info-card-row">
              <span className="info-card-k">Accès navigateur</span>
              <span className="info-card-v mono">http://{config?.beelink_ip || '10.0.0.1'}:8080</span>
            </div>
            <p className="info-hint">Chaque drone peut publier sur son propre lien <code className="mono">/live/[drone_id]</code> (ex: /live/m350-01) pour être identifié. Le lien générique <code className="mono">/live</code> fonctionne aussi mais sans info drone.</p>
          </div>
        </div>

        <button className="sheet-btn sheet-btn--ghost sheet-btn--full" onClick={onClose}>Fermer</button>
      </div>
    </div>
  )
}

function DroneInfoModal({ open, onClose, drone }) {
  if (!open || !drone) return null
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-glass" onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3 className="sheet-title">Drone</h3>
        {drone.image && (
          <div style={{ padding: '0 16px 8px', textAlign: 'center' }}>
            <img src={drone.image} alt={drone.name} style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 12, objectFit: 'contain' }} />
          </div>
        )}
        <div className="sheet-section">
          <div className="info-card">
            <div className="info-card-row">
              <span className="info-card-k">Nom</span>
              <span className="info-card-v">{drone.name}</span>
            </div>
            {(drone.brand || drone.model) && (
              <div className="info-card-row">
                <span className="info-card-k">Modèle</span>
                <span className="info-card-v">{drone.brand ? `${drone.brand} ` : ''}{drone.model || ''}</span>
              </div>
            )}
            {drone.exploitant && (
              <div className="info-card-row">
                <span className="info-card-k">Exploitant</span>
                <span className="info-card-v">{drone.exploitant}</span>
              </div>
            )}
            {drone.unit && (
              <div className="info-card-row">
                <span className="info-card-k">Unité</span>
                <span className="info-card-v">{drone.unit}</span>
              </div>
            )}
            {drone.type && (
              <div className="info-card-row">
                <span className="info-card-k">Type</span>
                <span className="info-card-v">{drone.type}</span>
              </div>
            )}
            {drone.description && (
              <p className="info-hint" style={{ marginTop: 8 }}>{drone.description}</p>
            )}
            {drone.generic && (
              <p className="info-hint">Flux générique — aucun drone identifié (publish sur /live).</p>
            )}
            {drone.unknown && (
              <p className="info-hint">Drone non référencé — ID reçu mais absent de la liste.</p>
            )}
          </div>
        </div>
        <button className="sheet-btn sheet-btn--ghost sheet-btn--full" onClick={onClose}>Fermer</button>
      </div>
    </div>
  )
}

function LiveView({ config }) {
  const [isConnected, setIsConnected] = useState(false)
  const [now, setNow] = useState(new Date())
  const [showSettings, setShowSettings] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showShutdown, setShowShutdown] = useState(false)
  const [showDroneInfo, setShowDroneInfo] = useState(false)
  const [shutting, setShutting] = useState(false)
  const [activeDrone, setActiveDrone] = useState(null)

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  // Poll active drone(s)
  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const r = await fetch('/api/drones/active')
        const d = await r.json()
        if (cancelled) return
        if (d.active && d.active.length > 0) {
          // Prefer first non-generic with known info, else first
          const withId = d.active.find(a => a.droneId || a.id)
          const chosen = withId || d.active[0]
          // Map to drone info shape for modal
          // If generic (id null), show generic
          setActiveDrone(chosen)
        } else {
          setActiveDrone(null)
        }
      } catch { if (!cancelled) setActiveDrone(null) }
    }
    poll()
    const iv = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  const streamUrl = getDroneStreamUrl(activeDrone?.droneId || activeDrone?.id)

  const handleStreamStatus = useCallback((status) => {
    setIsConnected(status === 'connected')
  }, [])

  const handleShutdown = async () => {
    setShutting(true)
    try { await fetch('/api/system/shutdown', { method: 'POST' }) } catch {}
    setShutting(false)
    setShowShutdown(false)
  }

  return (
    <div className="live-container">
      {/* Top — Paris time, fully transparent */}
      <header className="live-topbar">
        <span className="live-time">{formatParisTime(now)}</span>
      </header>

      <main className="stream-container">
        <StreamPlayer streamUrl={streamUrl} onStatusChange={handleStreamStatus} />
        {!isConnected && (
          <div className="waiting-overlay">
            <div className="waiting-content">
              <h2>En attente du flux</h2>
              <p>Connectez la télécommande au WiFi</p>
            </div>
            <div className="waiting-ring-wrap" aria-hidden="true">
              <Ring className="waiting-ring" />
            </div>
          </div>
        )}
      </main>

      {/* Bottom dock — liquid glass */}
      <nav className="dock" aria-label="Menu">
        <button className="dock-item" onClick={()=>{}} aria-label="État connexion">
          <StatusDot state={isConnected ? 'green' : 'red'} />
          <span className="dock-label">{isConnected ? 'Connecté' : 'Non connecté'}</span>
        </button>

        <button className="dock-item dock-item--icon" onClick={()=>setShowSettings(true)} aria-label="Réglages">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82-.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0 .33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
          <span className="dock-label-sm">Réglages</span>
        </button>

        <button className="dock-item dock-item--icon" onClick={()=>setShowInfo(true)} aria-label="Informations">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 11v5" />
            <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
          </svg>
          <span className="dock-label-sm">Infos</span>
        </button>

        {activeDrone && activeDrone.id && (
          <button className="dock-item dock-item--icon" onClick={()=>setShowDroneInfo(true)} aria-label="Drone">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5" cy="5" r="2.5" />
              <circle cx="19" cy="5" r="2.5" />
              <circle cx="5" cy="19" r="2.5" />
              <circle cx="19" cy="19" r="2.5" />
              <rect x="8" y="8" width="8" height="8" rx="1.5" />
              <line x1="5" y1="7.5" x2="8" y2="9.5" />
              <line x1="19" y1="7.5" x2="16" y2="9.5" />
              <line x1="5" y1="16.5" x2="8" y2="14.5" />
              <line x1="19" y1="16.5" x2="16" y2="14.5" />
            </svg>
            <span className="dock-label-sm">{activeDrone.name || activeDrone.id}</span>
          </button>
        )}

        <button className="dock-close" onClick={()=>setShowShutdown(true)} aria-label="Éteindre">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </nav>

      <SettingsModal open={showSettings} onClose={()=>setShowSettings(false)} config={config} />
      <InfoModal open={showInfo} onClose={()=>setShowInfo(false)} config={config} isConnected={isConnected} />
      <DroneInfoModal open={showDroneInfo} onClose={()=>setShowDroneInfo(false)} drone={activeDrone} />
      <ConfirmModal
        open={showShutdown}
        onClose={()=>setShowShutdown(false)}
        onConfirm={handleShutdown}
        title="Éteindre le système ?"
        message="Le flux sera interrompu. Vous devrez rallumer l'appareil manuellement."
        confirmLabel={shutting ? 'Extinction…' : 'Éteindre'}
        confirmVariant="danger"
        icon="power"
      />
    </div>
  )
}

export default LiveView
