import { useState, useEffect } from 'react'
import PinScreen from './components/PinScreen'
import PilotSelection from './components/PilotSelection'
import LiveView from './components/LiveView'
import Calibrate from './components/Calibrate'
import { Ring } from './components/loading-ui/ring'
import { getPilots, getConfig, setLastPilot } from './api'

function App() {
  // Calibrate route: http://10.0.0.1:8080/?calibrate=1 or /calibrate
  if (typeof window !== 'undefined' && (window.location.pathname === '/calibrate' || window.location.search.includes('calibrate'))) {
    return <Calibrate />
  }
  const [view, setView] = useState('loading')
  const [pilots, setPilots] = useState([])
  const [config, setConfig] = useState(null)
  const [selectedPilot, setSelectedPilot] = useState(null)

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [pilotsData, configData] = await Promise.all([
          getPilots(),
          getConfig()
        ])
        setPilots(pilotsData)
        setConfig(configData)
        setView('pin')
      } catch (error) {
        console.error('Erreur chargement initial:', error)
        setView('pin')
      }
    }
    loadInitialData()
  }, [])

  const handlePilotSelect = async (pilot) => {
    setSelectedPilot(pilot)
    await setLastPilot(pilot.id)
    setView('live')
  }

  const handleChangePilot = () => {
    setSelectedPilot(null)
    setView('selection')
  }

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
      <PinScreen onUnlock={() => setView('selection')} />
    )
  }

  return (
    <div className="app">
      {view === 'selection' && (
        <PilotSelection 
          pilots={pilots} 
          onSelect={handlePilotSelect}
        />
      )}
      {view === 'live' && (
        <LiveView 
          pilot={selectedPilot}
          config={config}
          onChangePilot={handleChangePilot}
        />
      )}
    </div>
  )
}

export default App
