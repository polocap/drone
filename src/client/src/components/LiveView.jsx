import { useState, useEffect } from 'react'
import BatteryIndicator from './BatteryIndicator'
import StreamPlayer from './StreamPlayer'
import { getBattery, getStreamUrl } from '../api'
import './LiveView.css'

function LiveView({ pilot, config, onChangePilot }) {
  const [battery, setBattery] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isRecording, setIsRecording] = useState(false)
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    async function fetchBattery() {
      try {
        const data = await getBattery()
        setBattery(data)
      } catch (error) {
        console.error('Erreur batterie:', error)
        setBattery({
          percent: 85,
          remaining: 180,
          charging: false
        })
      }
    }
    
    fetchBattery()
    const interval = setInterval(fetchBattery, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isConnected) setIsRecording(true)
    }, 1000)
    return () => clearTimeout(timer)
  }, [isConnected])

  const handleStreamStatus = (status) => {
    setIsConnected(status === 'connected')
  }

  return (
    <div className="live-container">
      <header className="live-header">
        <div className="header-left">
          <button className="change-pilot-btn" onClick={onChangePilot}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>
          <div className="pilot-info-header">
            <span className="pilot-name-header">{pilot.name}</span>
            <span className="pilot-unit-header">{pilot.unit}</span>
          </div>
        </div>
        
        <div className="header-center">
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            {isConnected ? 'CONNECTÉ' : 'EN ATTENTE'}
          </div>
          {isRecording && (
            <div className="recording-indicator">
              <span className="rec-dot"></span>
              REC
            </div>
          )}
        </div>
        
        <div className="header-right">
          <div className="time-display">
            <span className="time">{currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="date">{currentTime.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</span>
          </div>
          {battery && <BatteryIndicator battery={battery} />}
        </div>
      </header>

      <main className="stream-container">
        <StreamPlayer 
          streamUrl={getStreamUrl(pilot.rtmp_key)}
          onStatusChange={handleStreamStatus}
        />
        
        {!isConnected && (
          <div className="waiting-overlay">
            <div className="waiting-content">
              <h2>En attente du flux</h2>
              <p>Connectez la télécommande au WiFi</p>
              <div className="wifi-info">
                <span className="wifi-ssid">{config?.wifi_ssid || 'DRONE-OPS-XXX'}</span>
                <span className="wifi-pass">Mot de passe: {config?.wifi_password || 'drone2024'}</span>
              </div>
              <div className="rtmp-info">
                <code>rtmp://{config?.beelink_ip || '10.0.0.1'}:1935/live/{pilot.rtmp_key}</code>
              </div>
              <div className="external-access-info">
                <h3>Pour les camions PC</h3>
                <p>Connectez-vous au WiFi puis:</p>
                <code>http://{config?.beelink_ip || '10.0.0.1'}:8080</code>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default LiveView
