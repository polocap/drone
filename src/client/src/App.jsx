import { useState, useEffect } from 'react'
import PinScreen from './components/PinScreen'
import PilotSelection from './components/PilotSelection'
import LiveView from './components/LiveView'
import { getPilots, getConfig, setLastPilot } from './api'

function App() {
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
        <div className="loading-spinner">
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
        </div>
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
