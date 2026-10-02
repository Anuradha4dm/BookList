import { useEffect, useRef, type KeyboardEvent } from 'react'
import {
  CANCELLED_STATUS,
  PIPELINE_STAGES,
  Spinner,
  StatusGlyph,
  StatusPill,
  formatRupees,
} from '@booklist/ui'

export const ORDER_PLACED = 'Order Is Placed'
export const DELIVERY_TBC = 'Delivery charge: to be confirmed by the shop'

export type OrderCancellation = {
  by: 'parent' | 'admin'
  reason: string | null
  at: string | null
}

export type OrderPackLine = {
  packName: string
  label: string
  gradeName: string
  lineTotal: number
  books: Array<{ title: string; unitPrice: number; quantity: number }>
}

export type OrderItemLine = {
  title: string
  unitPrice: number
  quantity: number
  lineTotal: number
}

export type OrderDetailData = {
  id: number
  publicNumber: number
  status: string
  placedAt: string
  goodsTotal: number
  deliveryPrice: number | null
  payableTotal: number | null
  note: string | null
  deliveryAddress: string
  cancellation: OrderCancellation | null
  packLines: OrderPackLine[]
  itemLines: OrderItemLine[]
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || typeof value === 'number'
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isPackBook(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.unitPrice === 'number' &&
    typeof value.quantity === 'number'
  )
}

function isPackLine(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.packName === 'string' &&
    typeof value.label === 'string' &&
    typeof value.gradeName === 'string' &&
    typeof value.lineTotal === 'number' &&
    Array.isArray(value.books) &&
    value.books.every(isPackBook)
  )
}

function isItemLine(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.unitPrice === 'number' &&
    typeof value.quantity === 'number' &&
    typeof value.lineTotal === 'number'
  )
}

function isCancellation(value: unknown): boolean {
  if (value === null) return true
  return (
    isRecord(value) &&
    (value.by === 'parent' || value.by === 'admin') &&
    isStringOrNull(value.reason) &&
    isStringOrNull(value.at)
  )
}

/**
 * Reads `{ order }` from a detail or cancel answer, down to every line and book, or undefined
 * when any part is not that shape, so malformed data never reaches the render.
 */
export function parseOrderDetail(body: unknown): OrderDetailData | undefined {
  const order = (body as { order?: unknown } | null)?.order
  if (!isRecord(order)) return undefined
  const o = order
  if (
    typeof o.id !== 'number' ||
    typeof o.publicNumber !== 'number' ||
    typeof o.status !== 'string' ||
    typeof o.placedAt !== 'string' ||
    typeof o.goodsTotal !== 'number' ||
    !isNumberOrNull(o.deliveryPrice) ||
    !isNumberOrNull(o.payableTotal) ||
    !isStringOrNull(o.note) ||
    typeof o.deliveryAddress !== 'string' ||
    !Array.isArray(o.packLines) ||
    !o.packLines.every(isPackLine) ||
    !Array.isArray(o.itemLines) ||
    !o.itemLines.every(isItemLine) ||
    !isCancellation(o.cancellation)
  ) {
    return undefined
  }
  return order as OrderDetailData
}

function TickIcon() {
  return (
    <svg
      viewBox="0 0 14 14"
      width={12}
      height={12}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeLinecap="square"
    >
      <path d="M2 7.6l3.2 3.2L12 3.6" strokeWidth="2.6" />
    </svg>
  )
}

/** The seven pipeline stages, top to bottom. Stages before the current one count as done. */
function OrderTimeline({ status }: { status: string }) {
  const current = PIPELINE_STAGES.indexOf(status as (typeof PIPELINE_STAGES)[number])
  // An unknown status has no place on the line: show it as the pill's plain-text fallback.
  if (current === -1) return <StatusPill status={status} />
  return (
    <ol className="order-timeline" aria-label="Order progress">
      {PIPELINE_STAGES.map((stage, index) => {
        if (index < current) {
          return (
            <li key={stage} className="order-timeline-step is-done">
              <span className="order-timeline-marker">
                <TickIcon />
              </span>
              <span className="order-timeline-label text-body-strong">{stage}</span>
              <span className="visually-hidden"> (done)</span>
            </li>
          )
        }
        if (index === current) {
          return (
            <li key={stage} className="order-timeline-step is-current" aria-current="step">
              <span className="order-timeline-marker">
                <StatusGlyph status={stage} />
              </span>
              <span className="order-timeline-label">{stage}</span>
            </li>
          )
        }
        return (
          <li key={stage} className="order-timeline-step is-upcoming">
            <span className="order-timeline-marker" />
            <span className="order-timeline-label text-meta">{stage}</span>
          </li>
        )
      })}
    </ol>
  )
}

type OrderDetailProps = {
  id: string
  detail: OrderDetailData | undefined
  loadError: string
  busy: boolean
  onCancel: () => void
}

/** The inline detail of one order: snapshot lines, totals, timeline or reason, and Cancel. */
export function OrderDetail({ id, detail, loadError, busy, onCancel }: OrderDetailProps) {
  if (!detail) {
    return (
      <div className="order-detail" id={id}>
        {loadError ? (
          <p className="form-error text-meta" role="alert">
            {loadError}
          </p>
        ) : (
          <Spinner />
        )}
      </div>
    )
  }

  const cancelled = detail.status === CANCELLED_STATUS
  const cancellation = detail.cancellation

  return (
    <div className="order-detail" id={id}>
      <section className="order-detail-section" aria-label="Lines">
        <ul className="order-detail-lines">
          {detail.packLines.map((line, index) => (
            <li key={`pack-${index}`} className="order-detail-line">
              <div className="order-detail-line-main">
                <span className="text-body-strong">{line.packName}</span>
                <span className="text-amount-row">{formatRupees(line.lineTotal)}</span>
              </div>
              <span className="text-meta">{line.label}</span>
              <ul className="order-detail-books text-meta">
                {line.books.map((book, bookIndex) => (
                  <li key={bookIndex} className="order-detail-book">
                    <span>
                      {book.title} ×{book.quantity}
                    </span>
                    <span>{formatRupees(book.unitPrice)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {detail.itemLines.map((line, index) => (
            <li key={`item-${index}`} className="order-detail-line">
              <div className="order-detail-line-main">
                <span className="text-body-strong">{line.title}</span>
                <span className="text-amount-row">{formatRupees(line.lineTotal)}</span>
              </div>
              <span className="text-meta">
                {formatRupees(line.unitPrice)} ×{line.quantity}
              </span>
            </li>
          ))}
        </ul>
        <div className="order-detail-totals">
          <div className="order-detail-total">
            <span className="text-body-strong">Goods total</span>
            <span className="text-amount-row">{formatRupees(detail.goodsTotal)}</span>
          </div>
          {detail.deliveryPrice !== null ? (
            <div className="order-detail-total">
              <span className="text-body-strong">Delivery charge</span>
              <span className="text-amount-row">{formatRupees(detail.deliveryPrice)}</span>
            </div>
          ) : null}
          {detail.payableTotal !== null ? (
            <div className="order-detail-total">
              <span className="text-body-strong">Payable total</span>
              <span className="text-amount-row">{formatRupees(detail.payableTotal)}</span>
            </div>
          ) : null}
        </div>
        {detail.deliveryPrice === null && !cancelled ? (
          <div className="notice notice-info">
            <p className="notice-body">{DELIVERY_TBC}</p>
          </div>
        ) : null}
      </section>

      <section className="order-detail-section" aria-label="Delivery">
        <span className="checkout-section-label text-label-caps">Delivery address</span>
        <span>{detail.deliveryAddress}</span>
        {detail.note ? <span className="text-meta">Note: {detail.note}</span> : null}
      </section>

      <section className="order-detail-section" aria-label="Status">
        {cancelled ? (
          <>
            <StatusPill status={detail.status} />
            {cancellation?.by === 'parent' ? (
              <p className="order-detail-reason">You cancelled this order.</p>
            ) : cancellation?.by === 'admin' ? (
              cancellation.reason?.trim() ? (
                <p className="order-detail-reason">Reason: {cancellation.reason}</p>
              ) : (
                <p className="order-detail-reason">The shop cancelled this order.</p>
              )
            ) : null}
          </>
        ) : (
          <OrderTimeline status={detail.status} />
        )}
      </section>

      {detail.status === ORDER_PLACED ? (
        <button
          type="button"
          className="button-secondary order-detail-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel order
        </button>
      ) : null}
    </div>
  )
}

type CancelModalProps = {
  publicNumber: number
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}

/** The one-deep confirmation for a parent cancel: focus stays inside, Escape closes. */
export function CancelOrderModal({ publicNumber, busy, onConfirm, onClose }: CancelModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const keepRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    keepRef.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!busy) onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button')
    if (!focusable || focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    // Focus on the dialog container itself counts as the first stop, so Shift+Tab wraps too.
    const atStart =
      document.activeElement === first || document.activeElement === dialogRef.current
    if (event.shiftKey && atStart) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const titleId = `cancel-order-${publicNumber}-title`
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        // A press on the backdrop must not pull focus out of the dialog.
        if (event.target === event.currentTarget) event.preventDefault()
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <h2 className="modal-title text-heading-md" id={titleId}>
          Cancel order #{publicNumber}?
        </h2>
        <p className="modal-body">The shop will not prepare this order.</p>
        <div className="modal-actions">
          {/* Never disabled while busy, so focus cannot fall out of the dialog. */}
          <button
            type="button"
            className="button-secondary"
            ref={keepRef}
            aria-disabled={busy}
            onClick={() => {
              if (!busy) onClose()
            }}
          >
            Keep order
          </button>
          <button
            type="button"
            className="button-danger-solid"
            aria-disabled={busy}
            onClick={() => {
              if (!busy) onConfirm()
            }}
          >
            Cancel order
          </button>
        </div>
      </div>
    </div>
  )
}
