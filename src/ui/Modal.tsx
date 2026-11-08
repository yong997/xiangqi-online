import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  children?: ReactNode
  actions?: ReactNode
  tone?: 'default' | 'danger'
  onBackdrop?: () => void
}

export function Modal({ title, children, actions, tone = 'default', onBackdrop }: ModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={onBackdrop}>
      <section
        className={`modal-card modal-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        {children && <div className="modal-body">{children}</div>}
        {actions && <div className="modal-actions">{actions}</div>}
      </section>
    </div>
  )
}
