import { useState, useCallback, useRef } from 'react'
import ConfirmModal from './ConfirmModal'
import './PinScreen.css'

const CORRECT_PIN = '123456'
const PIN_LENGTH = 6

function PinScreen({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [showShutdown, setShowShutdown] = useState(false)
  const [shutting, setShutting] = useState(false)
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
            }, 700)
          }
        }, 120)
      }
      return newPin
    })
  }, [onUnlock])

  const handleBackspace = useCallback((e) => {
    if (e) { e.preventDefault(); e.stopPropagation() }
    setPin(prev => prev.slice(0, -1))
    setError(false)
  }, [])

  const CAL_REL_X_A = 1, CAL_REL_X_B = 0, CAL_REL_Y_A = 1, CAL_REL_Y_B = 0
  const handleKeypadPointerDown = useCallback((e) => {
    e.preventDefault()
    const keypad = keypadRef.current
    if (!keypad) return
    const rawX = e.clientX
    const rawY = e.clientY
    const kr = keypad.getBoundingClientRect()
    const relX = (rawX - kr.left) / kr.width
    const relY = (rawY - kr.top) / kr.height
    const corrRelX = CAL_REL_X_A * relX + CAL_REL_X_B
    const corrRelY = CAL_REL_Y_A * relY + CAL_REL_Y_B
    const x = corrRelX * kr.width + kr.left
    const y = corrRelY * kr.height + kr.top

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
          type: 'pointerdown', rawX, rawY, clientX: x, clientY: y,
          cal: { ax: CAL_REL_X_A, bx: CAL_REL_X_B, ay: CAL_REL_Y_A, by: CAL_REL_Y_B },
          keypadRect: { left: keypadRect.left, top: keypadRect.top, width: keypadRect.width, height: keypadRect.height },
          pinRect: pinRect ? { left: pinRect.left, top: pinRect.top, width: pinRect.width, height: pinRect.height } : null,
          viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
          rects,
          target: e.target?.getAttribute('aria-label') || e.target?.textContent?.trim() || e.target?.className
        })
      }).catch(()=>{})
    } catch (err) {}

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
      if (dist < bestDist) { bestDist = dist; best = btn }
    }
    if (best) {
      const label = best.getAttribute('aria-label') || best.textContent.trim()
      const r = best.getBoundingClientRect()
      const distToBest = Math.sqrt(bestDist)
      const maxDist = Math.max(r.width, r.height) * 1.5
      if (distToBest > maxDist * 3) return
      if (label.startsWith('Touche ')) {
        handleDigit(label.replace('Touche ', ''))
      } else if (label === 'Supprimer') {
        handleBackspace(e)
      }
      best.classList.add('pin-key-active-debug')
      setTimeout(()=> best.classList.remove('pin-key-active-debug'), 140)
    }
  }, [handleDigit, handleBackspace])

  const handleShutdown = async () => {
    setShutting(true)
    try {
      await fetch('/api/system/shutdown', { method: 'POST' })
    } catch {}
    setShutting(false)
    setShowShutdown(false)
  }

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => (
    <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''} ${error ? 'error' : ''}`} />
  ))

  return (
    <div className="pin-screen notranslate" translate="no">
      <button className="pin-power-btn" aria-label="Éteindre" onClick={() => setShowShutdown(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 3v8" />
          <path d="M7.08 6.5A8 8 0 1 0 16.92 6.5" />
        </svg>
      </button>

      <div className="pin-header">
        <div className="pin-brand">
          <span className="pin-brand-drone">core</span>
          <span className="pin-brand-ops">Links</span>
        </div>
        <p className="pin-subtitle">Entrez le code d'accès</p>
      </div>

      <div className={`pin-dots ${error ? 'shake' : ''}`}>{dots}</div>

      <div className="pin-keypad" ref={keypadRef} onPointerDown={handleKeypadPointerDown}>
        {[1,2,3,4,5,6,7,8,9].map(digit => (
          <button key={digit} type="button" className="pin-key" aria-label={`Touche ${digit}`} onClick={e=>e.preventDefault()} tabIndex={-1}>{digit}</button>
        ))}
        <div className="pin-key-spacer" aria-hidden="true" />
        <button type="button" className="pin-key" aria-label="Touche 0" onClick={e=>e.preventDefault()} tabIndex={-1}>0</button>
        <button type="button" className="pin-key pin-key-back" aria-label="Supprimer" onClick={e=>e.preventDefault()} tabIndex={-1}>
          <span className="pin-key-back-glyph">×</span>
        </button>
      </div>

      <ConfirmModal
        open={showShutdown}
        onClose={() => setShowShutdown(false)}
        onConfirm={handleShutdown}
        title="Éteindre le système ?"
        message="Le système va s'éteindre. Cette action nécessite un redémarrage manuel."
        confirmLabel={shutting ? 'Extinction…' : 'Éteindre'}
        confirmVariant="danger"
        icon="power"
      />
    </div>
  )
}

export default PinScreen
