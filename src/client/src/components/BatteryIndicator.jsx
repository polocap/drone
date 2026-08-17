import './BatteryIndicator.css'

function BatteryIndicator({ battery }) {
  const getBatteryColor = (percent) => {
    if (percent > 50) return '#00ff88'
    if (percent > 20) return '#ffaa00'
    return '#ff5050'
  }

  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}min` : `${mins}min`
  }

  return (
    <div className="battery-container">
      <div className="battery-icon">
        <div className="battery-body">
          <div 
            className="battery-level" 
            style={{ 
              width: `${battery.percent}%`,
              backgroundColor: getBatteryColor(battery.percent)
            }}
          />
        </div>
        <div className="battery-tip" />
      </div>
      
      <div className="battery-info">
        <span 
          className="battery-percent"
          style={{ color: getBatteryColor(battery.percent) }}
        >
          {battery.percent}%
        </span>
        <span className="battery-time">
          {battery.remaining ? formatTime(battery.remaining) : '--'}
        </span>
      </div>
      
      {battery.charging && (
        <div className="charging-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.47-.66.1-.34.37-.74.63-1.08.82-1.11 2.08-2.58 2.74-3.42.27-.34.54-.6.8-.6.28 0 .48.24.44.86l-.02.6H13.0c.71 0 .89.38.51.94-.38.56-.86 1.16-1.4 1.82-.77.95-1.62 1.98-2.13 2.73-.18.26-.33.48-.46.47-.26-.02-.25-.51-.25-.51l.5-3.15z"/>
          </svg>
        </div>
      )}
    </div>
  )
}

export default BatteryIndicator
