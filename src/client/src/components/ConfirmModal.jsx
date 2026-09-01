import './ConfirmModal.css'

function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', confirmVariant = 'danger', icon = 'power' }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-glass" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={`modal-icon modal-icon--${confirmVariant}`}>
          {icon === 'power' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M12 3v8" />
              <path d="M7.08 6.5A8 8 0 1 0 16.92 6.5" />
            </svg>
          ) : icon === 'close' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : null}
        </div>
        <h3 className="modal-title">{title}</h3>
        {message && <p className="modal-message">{message}</p>}
        <div className="modal-actions">
          <button className="modal-btn modal-btn--ghost" onClick={onClose}>{cancelLabel}</button>
          <button className={`modal-btn modal-btn--${confirmVariant}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
