import { useState, useEffect } from 'react'
import PinScreen from './components/PinScreen'
import LiveView from './components/LiveView'
import ViewerView from './components/ViewerView'
import Calibrate from './components/Calibrate'
import { Ring } from './components/loading-ui/ring'
import { getConfig } from './api'

function App() {
  if (typeof window !== 'undefined' && (window.location.pathname === '/calibrate' || window.location.search.includes('calibrate'))) {
    return <Calibrate />
  }
  // Écrans externes (WiFi routeur) : vue lecture seule sans PIN
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('viewer')) {
    return (
      <div className="app">
        <ViewerView />
      </div>
    )
  }
  const [view, setView] = useState('loading')
  const [config, setConfig] = useState(null)

  useEffect(() => {
    async function loadInitialData() {
      try {
        const configData = await getConfig()
        setConfig(configData)
        setView('pin')
      } catch (error) {
        console.error('Erreur chargement initial:', error)
        setView('pin')
      }
    }
    loadInitialData()
  }, [])

  if (view === 'loading') {
    return (
      <div className="loading-screen">
        <div className="loading-brand">
          <span className="loading-logo-drone">drone</span>
          <span className="loading-logo-ops">Ops</span>
        </div>
        <Ring className="loading-ring" />
      </div>
    )
  }

  if (view === 'pin') {
    return (
      <PinScreen onUnlock={() => setView('live')} />
    )
  }

  return (
    <div className="app">
      <LiveView config={config} />
    </div>
  )
}

export default App
