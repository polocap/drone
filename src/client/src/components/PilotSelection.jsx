import { useState } from 'react'
import './PilotSelection.css'

function PilotSelection({ pilots, onSelect }) {
  const [selectedIndex, setSelectedIndex] = useState(null)

  const handleClick = (pilot, index) => {
    setSelectedIndex(index)
    setTimeout(() => onSelect(pilot), 150)
  }

  return (
    <div className="selection-container">
      <header className="selection-header">
        <div className="logo-section">
          <div className="drone-icon">
            <svg viewBox="0 0 100 100" className="icon-svg">
              <circle cx="20" cy="20" r="10" fill="currentColor" />
              <circle cx="80" cy="20" r="10" fill="currentColor" />
              <circle cx="20" cy="80" r="10" fill="currentColor" />
              <circle cx="80" cy="80" r="10" fill="currentColor" />
              <rect x="35" y="35" width="30" height="30" rx="5" fill="currentColor" />
              <line x1="28" y1="28" x2="35" y2="35" stroke="currentColor" strokeWidth="3" />
              <line x1="72" y1="28" x2="65" y2="35" stroke="currentColor" strokeWidth="3" />
              <line x1="28" y1="72" x2="35" y2="65" stroke="currentColor" strokeWidth="3" />
              <line x1="72" y1="72" x2="65" y2="65" stroke="currentColor" strokeWidth="3" />
            </svg>
          </div>
          <h1>DRONE OPS</h1>
        </div>
        <p className="subtitle">Sélectionner le pilote</p>
      </header>

      <div className="pilots-grid">
        {pilots.map((pilot, index) => (
          <button
            key={pilot.id}
            className={`pilot-card ${selectedIndex === index ? 'selected' : ''}`}
            onClick={() => handleClick(pilot, index)}
          >
            <div className="pilot-avatar">
              <span>{pilot.name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="pilot-info">
              <span className="pilot-name">{pilot.name}</span>
              <span className="pilot-unit">{pilot.unit}</span>
            </div>
          </button>
        ))}
      </div>

      <footer className="selection-footer">
        <p>Version 1.0.0</p>
      </footer>
    </div>
  )
}

export default PilotSelection
