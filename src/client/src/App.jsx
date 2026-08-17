import { useState, useEffect } from 'react'
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
        
        if (configData.lastPilot) {
          const lastPilot = pilotsData.find(p => p.id === configData.lastPilot)
          if (lastPilot) {
            setSelectedPilot(lastPilot)
            setView('live')
            return
          }
        }
        setView('selection')
      } catch (error) {
        console.error('Erreur chargement initial:', error)
        setView('selection')
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
    return <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initialisation...</p>
    </div>
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
