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
  const [status, setStatus] = useState({ wifi: 'loading', rtmp: 'loading' })

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function fetchStatus() {
      try {
        const r = await fetch('/api/system/status')
        const d = await r.json()
        if (!cancelled) setStatus({
          wifi: d.wifi ? 'green' : 'red',
          rtmp: d.rtmp ? (d.rtmp === 'degraded' ? 'yellow' : 'green') : 'red',
        })
      } catch {
        if (!cancelled) setStatus({ wifi: 'yellow', rtmp: 'yellow' })
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
              <span className="status-row-label">Lien RTMP distant</span>
              <span className="status-row-value" title={status.rtmp === 'yellow' ? 'Serveur joignable mais aucun flux drone reçu (en attente)' : undefined}>
                <StatusDot state={status.rtmp} />
                {status.rtmp === 'green' ? 'Opérationnel' : status.rtmp === 'yellow' ? 'En attente — aucun flux' : status.rtmp === 'red' ? 'Hors ligne' : '…'}
              </span>
            </div>
            <div className="status-row">
              <span className="status-row-label">Flux drone</span>
              <span className="status-row-value">
                <StatusDot state={isConnected ? 'green' : 'red'} />
                {isConnected ? 'Connecté' : 'En attente'}
              </span>
            </div>
          </div>
        </div>

        <div className="sheet-section">
          <span className="sheet-section-label">Connexion WiFi</span>
          <div className="info-card">
            <div className="info-card-row">
              <span className="info-card-k">Réseau</span>
              <span className="info-card-v mono">{config?.wifi_ssid || 'DRONE-OPS-001'}</span>
            </div>
            <div className="info-card-row">
              <span className="info-card-k">Mot de passe</span>
              <span className="info-card-v mono">{config?.wifi_password || 'drone2024'}</span>
            </div>
          </div>
        </div>

        <div className="sheet-section">
          <span className="sheet-section-label">Transmission vers autres écrans</span>
          <div className="info-card">
            <div className="info-card-row">
              <span className="info-card-k">Flux RTMP</span>
              <span className="info-card-v mono">rtmp://{config?.beelink_ip || '10.0.0.1'}:1935/live</span>
            </div>
            <div className="info-card-row">
              <span className="info-card-k">Accès navigateur</span>
              <span className="info-card-v mono">http://{config?.beelink_ip || '10.0.0.1'}:8080</span>
            </div>
            <p className="info-hint">Connectez-vous au WiFi ci-dessus, puis ouvrez le lien dans un navigateur sur le réseau.</p>
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
  const [shutting, setShutting] = useState(false)

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

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
        <StreamPlayer streamUrl={getStreamUrl()} onStatusChange={handleStreamStatus} />
        {!isConnected && (
          <div className="waiting-overlay">
            <div className="waiting-ring-wrap" aria-hidden="true">
              <Ring className="waiting-ring" />
            </div>
            <div className="waiting-content">
              <h2>En attente du flux</h2>
              <p>Connectez la télécommande au WiFi</p>
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

        <button className="dock-close" onClick={()=>setShowShutdown(true)} aria-label="Éteindre">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </nav>

      <SettingsModal open={showSettings} onClose={()=>setShowSettings(false)} config={config} />
      <InfoModal open={showInfo} onClose={()=>setShowInfo(false)} config={config} isConnected={isConnected} />
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
