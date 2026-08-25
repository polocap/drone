import { useState, useCallback } from 'react'
import './PinScreen.css'

const CORRECT_PIN = '123456'
const PIN_LENGTH = 6

function PinScreen({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  const handleDigit = useCallback((digit) => {
    setPin(prev => {
      if (prev.length >= PIN_LENGTH) return prev
      const newPin = prev + digit
      setError(false)

      if (newPin.length === PIN_LENGTH) {
        setTimeout(() => {
          if (newPin === CORRECT_PIN) {
            onUnlock()
          } else {
            setError(true)
            setTimeout(() => {
              setPin('')
              setError(false)
            }, 800)
          }
        }, 150)
      }
      return newPin
    })
  }, [onUnlock])

  const handleBackspace = useCallback((e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setPin(prev => prev.slice(0, -1))
    setError(false)
  }, [])

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => (
    <div
      key={i}
      className={`pin-dot ${i < pin.length ? 'filled' : ''} ${error ? 'error' : ''}`}
    />
  ))

  return (
    <div className="pin-screen notranslate" translate="no">
      <div className="pin-header">
        <div className="pin-brand">
          <span className="pin-brand-drone">drone</span>
          <span className="pin-brand-ops">Ops</span>
        </div>
        <p className="pin-subtitle">Entrez le code d'accès</p>
      </div>

      <div className={`pin-dots ${error ? 'shake' : ''}`}>
        {dots}
      </div>

      <div className="pin-keypad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => (
          <button
            key={digit}
            type="button"
            className="pin-key"
            onClick={() => handleDigit(String(digit))}
            onPointerDown={(e) => e.preventDefault()}
            aria-label={`Touche ${digit}`}
          >
            {digit}
          </button>
        ))}
        <div className="pin-key-spacer" aria-hidden="true" />
        <button
          type="button"
          className="pin-key"
          onClick={() => handleDigit('0')}
          onPointerDown={(e) => e.preventDefault()}
          aria-label="Touche 0"
        >
          0
        </button>
        <button
          type="button"
          className="pin-key pin-key-back"
          onClick={handleBackspace}
          onPointerDown={(e) => e.preventDefault()}
          aria-label="Supprimer"
        >
          <span className="pin-key-back-glyph">×</span>
        </button>
      </div>
    </div>
  )
}

export default PinScreen
