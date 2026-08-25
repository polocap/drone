import { useState, useRef } from 'react'
import './PinScreen.css'

const TARGETS = ['1','2','3','4','5','6','7','8','9','0','x']
const LABELS = {
  '1': 'Touche 1', '2': 'Touche 2', '3': 'Touche 3',
  '4': 'Touche 4', '5': 'Touche 5', '6': 'Touche 6',
  '7': 'Touche 7', '8': 'Touche 8', '9': 'Touche 9',
  '0': 'Touche 0', 'x': 'Supprimer'
}

export default function Calibrate() {
  const [step, setStep] = useState(0)
  const [logs, setLogs] = useState([])
  const keypadRef = useRef(null)

  const target = TARGETS[step]
  const handlePointerDown = (e) => {
    e.preventDefault()
    const x = e.clientX
    const y = e.clientY
    const keypad = keypadRef.current
    const buttons = Array.from(keypad.querySelectorAll('.pin-key'))
    const rects = buttons.map(btn => {
      const r = btn.getBoundingClientRect()
      return { label: btn.getAttribute('aria-label'), x: r.left + r.width/2, y: r.top + r.height/2 }
    })
    const entry = {
      step, target, targetLabel: LABELS[target],
      clientX: x, clientY: y,
      rects,
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }
    }
    // send to server
    fetch('/api/config/debug-touch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'calibrate', ...entry })
    }).catch(()=>{})
    setLogs(prev => [...prev, entry])
    if (step < TARGETS.length - 1) {
      setStep(s => s + 1)
    } else {
      // done
      setStep(TARGETS.length)
    }
  }

  if (step >= TARGETS.length) {
    return (
      <div className="pin-screen" style={{justifyContent:'flex-start', paddingTop:'2rem'}}>
        <h2 style={{color:'#00d4ff'}}>Calibration terminée</h2>
        <p style={{color:'#8892b0', margin:'1rem'}}>Merci ! Logs envoyés. Redémarrage...</p>
        <pre style={{fontSize:'0.7rem', textAlign:'left', maxHeight:'60vh', overflow:'auto', background:'rgba(0,0,0,0.3)', padding:'1rem', borderRadius:'8px'}}>
          {JSON.stringify(logs, null, 2)}
        </pre>
        <button className="pin-key" style={{marginTop:'1rem', width:'auto', borderRadius:'8px', padding:'0 1.5rem'}} onClick={()=> { setStep(0); setLogs([])}}>Recommencer</button>
      </div>
    )
  }

  return (
    <div className="pin-screen notranslate" translate="no">
      <div className="pin-header">
        <p style={{color:'#00d4ff', fontSize:'1.2rem', marginBottom:'1rem'}}>Calibration tactile</p>
        <p className="pin-subtitle">Tapez sur <b style={{color:'#fff', fontSize:'1.4rem'}}>{target === 'x' ? '×' : target}</b> ({step+1}/{TARGETS.length})</p>
        {target && <p style={{color:'#8892b0', fontSize:'0.9rem'}}>Cible: {LABELS[target]} centre attendu</p>}
      </div>
      <div className="pin-keypad" ref={keypadRef} onPointerDown={handlePointerDown}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => (
          <button key={digit} type="button" className={`pin-key ${String(digit)===target ? 'pin-key-target' : ''}`} aria-label={`Touche ${digit}`} tabIndex={-1}>{digit}</button>
        ))}
        <div className="pin-key-spacer" aria-hidden="true" />
        <button type="button" className={`pin-key ${target==='0' ? 'pin-key-target' : ''}`} aria-label="Touche 0" tabIndex={-1}>0</button>
        <button type="button" className={`pin-key pin-key-back ${target==='x' ? 'pin-key-target' : ''}`} aria-label="Supprimer" tabIndex={-1}><span className="pin-key-back-glyph">×</span></button>
      </div>
      <p style={{color:'#5c6378', fontSize:'0.8rem', marginTop:'1rem'}}>{logs.length} taps enregistrés</p>
      <style>{`.pin-key-target{ border-color:#00d4ff !important; box-shadow:0 0 16px rgba(0,212,255,0.8); background:rgba(0,212,255,0.2) !important;}`}</style>
    </div>
  )
}
