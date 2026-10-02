import { useEffect, useRef, type KeyboardEvent } from 'react'

/** The one optional field a terminal action asks for: the cancel reason. */
export type TerminalModalField = {
  id: string
  label: string
  value: string
  maxLength: number
  /** Shown under the field and tied to it; the typed text is kept. */
  error?: string
  onChange: (next: string) => void
}

type TerminalModalProps = {
  title: string
  body: string
  confirmLabel: string
  dismissLabel: string
  busy: boolean
  field?: TerminalModalField
  /** A failure that is not about the field, shown inside the dialog. */
  error?: string
  /**
   * Where focus goes on close when the element that opened the modal is gone, e.g. the
   * Mark delivered button after a successful Delivered. It should be focusable (tabIndex -1).
   */
  fallbackFocusId?: string
  onConfirm: () => void
  onClose: () => void
}

/**
 * The one-deep confirmation for a final admin action (Delivered or Cancelled). Focus moves in on
 * open and back on close, Escape closes unless busy, Tab stays inside, and the backdrop never
 * closes it. No animation, so nothing slows the shop's next status change.
 */
export function TerminalModal({
  title,
  body,
  confirmLabel,
  dismissLabel,
  busy,
  field,
  error,
  fallbackFocusId,
  onConfirm,
  onClose,
}: TerminalModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const dismissRef = useRef<HTMLButtonElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  // Read on close, so a fallback rendered after the modal opened is still found.
  const fallbackRef = useRef(fallbackFocusId)
  fallbackRef.current = fallbackFocusId

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (fieldRef.current) fieldRef.current.focus()
    else dismissRef.current?.focus()
    return () => {
      if (previous?.isConnected) {
        previous.focus()
        return
      }
      // The trigger unmounted (the order is now final): land on a stable element, not <body>.
      const fallback = fallbackRef.current ? document.getElementById(fallbackRef.current) : null
      fallback?.focus()
    }
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!busy) onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('textarea, button')
    if (!focusable || focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    // Focus on the dialog container itself counts as the first stop, so Shift+Tab wraps too.
    const atStart = document.activeElement === first || document.activeElement === dialogRef.current
    if (event.shiftKey && atStart) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const titleId = 'admin-terminal-modal-title'
  const bodyId = 'admin-terminal-modal-body'
  const fieldErrorId = field ? `${field.id}-error` : undefined
  return (
    <div
      className="modal-backdrop admin-order-detail-modal"
      onMouseDown={(event) => {
        // A press on the backdrop must not pull focus out of the dialog, and never closes it.
        if (event.target === event.currentTarget) event.preventDefault()
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <h2 className="modal-title text-heading-md" id={titleId}>
          {title}
        </h2>
        <p className="modal-body" id={bodyId}>
          {body}
        </p>
        {field ? (
          <div className={field.error ? 'form-field admin-order-detail-modal-field is-invalid' : 'form-field admin-order-detail-modal-field'}>
            <label className="text-label-caps" htmlFor={field.id}>
              {field.label}
            </label>
            <textarea
              id={field.id}
              ref={fieldRef}
              className="form-control admin-order-detail-modal-textarea"
              name={field.id}
              rows={3}
              required
              readOnly={busy}
              maxLength={field.maxLength}
              value={field.value}
              aria-invalid={field.error ? true : undefined}
              aria-describedby={field.error ? fieldErrorId : undefined}
              onChange={(event) => field.onChange(event.target.value)}
            />
            {field.error ? (
              <p id={fieldErrorId} className="form-error text-meta" role="alert">
                {field.error}
              </p>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p className="form-error text-meta" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          {/* Never disabled while busy, so focus cannot fall out of the dialog. */}
          <button
            type="button"
            className="button-secondary"
            ref={dismissRef}
            aria-disabled={busy ? 'true' : undefined}
            onClick={() => {
              if (!busy) onClose()
            }}
          >
            {dismissLabel}
          </button>
          <button
            type="button"
            className="button-danger-solid"
            aria-disabled={busy ? 'true' : undefined}
            onClick={() => {
              if (!busy) onConfirm()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
