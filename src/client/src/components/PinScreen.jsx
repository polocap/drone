import { useState, useCallback, useRef } from 'react'
import './PinScreen.css'

const CORRECT_PIN = '123456'
const PIN_LENGTH = 6

function PinScreen({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const keypadRef = useRef(null)

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

  // Hardware calibrated via libinput (1.67/-0.37, 1.74/-0.37), so software should be identity.
  // Keep for debug but no extra transform - visual-nearest already bypasses hitbox offset.
  const CAL_REL_X_A = 1, CAL_REL_X_B = 0, CAL_REL_Y_A = 1, CAL_REL_Y_B = 0
  const handleKeypadPointerDown = useCallback((e) => {
    e.preventDefault()
    const keypad = keypadRef.current
    if (!keypad) return
    const rawX = e.clientX
    const rawY = e.clientY
    const kr = keypad.getBoundingClientRect()
    // Relative 0-1 within keypad, apply calibration, back to absolute
    const relX = (rawX - kr.left) / kr.width
    const relY = (rawY - kr.top) / kr.height
    const corrRelX = CAL_REL_X_A * relX + CAL_REL_X_B
    const corrRelY = CAL_REL_Y_A * relY + CAL_REL_Y_B
    const x = corrRelX * kr.width + kr.left
    const y = corrRelY * kr.height + kr.top

    // Debug: send raw+corrected to server
    try {
      const buttons = Array.from(keypad.querySelectorAll('.pin-key'))
      const rects = buttons.map(btn => {
        const r = btn.getBoundingClientRect()
        return { label: btn.getAttribute('aria-label') || btn.textContent.trim(), x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height }
      })
      const keypadRect = keypad.getBoundingClientRect()
      const pinRect = document.querySelector('.pin-screen')?.getBoundingClientRect()
      fetch('/api/config/debug-touch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'pointerdown',
          rawX, rawY, clientX: x, clientY: y,
          cal: { ax: CAL_REL_X_A, bx: CAL_REL_X_B, ay: CAL_REL_Y_A, by: CAL_REL_Y_B },
          keypadRect: { left: keypadRect.left, top: keypadRect.top, width: keypadRect.width, height: keypadRect.height },
          pinRect: pinRect ? { left: pinRect.left, top: pinRect.top, width: pinRect.width, height: pinRect.height } : null,
          viewport: { w: window.innerWidth, h: window.innerHeight, innerH: window.innerHeight, outerH: window.outerHeight, dpr: window.devicePixelRatio },
          rects,
          target: e.target?.getAttribute('aria-label') || e.target?.textContent?.trim() || e.target?.className
        })
      }).catch(()=>{})
    } catch (err) {}

    // Find visually nearest button
    const buttons = Array.from(keypad.querySelectorAll('.pin-key'))
    let best = null
    let bestDist = Infinity
    for (const btn of buttons) {
      const r = btn.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const dx = x - cx
      const dy = y - cy
      const dist = dx*dx + dy*dy
      if (dist < bestDist) {
        bestDist = dist
        best = btn
      }
    }
    if (best) {
      const label = best.getAttribute('aria-label') || best.textContent.trim()
      const r = best.getBoundingClientRect()
      const distToBest = Math.sqrt(bestDist)
      const maxDist = Math.max(r.width, r.height) * 1.5
      if (distToBest > maxDist * 3) return
      if (label.startsWith('Touche ')) {
        const digit = label.replace('Touche ', '')
        handleDigit(digit)
      } else if (label === 'Supprimer') {
        handleBackspace(e)
      }
      // Visual feedback: trigger :active
      best.classList.add('pin-key-active-debug')
      setTimeout(()=> best.classList.remove('pin-key-active-debug'), 150)
    }
  }, [handleDigit, handleBackspace])

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

      <div className="pin-keypad" ref={keypadRef} onPointerDown={handleKeypadPointerDown}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => (
          <button
            key={digit}
            type="button"
            className="pin-key"
            aria-label={`Touche ${digit}`}
            onClick={(e) => e.preventDefault()}
            tabIndex={-1}
          >
            {digit}
          </button>
        ))}
        <div className="pin-key-spacer" aria-hidden="true" />
        <button
          type="button"
          className="pin-key"
          aria-label="Touche 0"
          onClick={(e) => e.preventDefault()}
          tabIndex={-1}
        >
          0
        </button>
        <button
          type="button"
          className="pin-key pin-key-back"
          aria-label="Supprimer"
          onClick={(e) => e.preventDefault()}
          tabIndex={-1}
        >
          <span className="pin-key-back-glyph">×</span>
        </button>
      </div>
    </div>
  )
}

export default PinScreen
