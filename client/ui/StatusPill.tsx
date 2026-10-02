import type { ReactNode } from 'react'

/** The eight stored order statuses, in pipeline order. Cancelled is last and sits off the line. */
export const ORDER_STATUSES = [
  'Order Is Placed',
  'Order Confirmed',
  'Processing',
  'Packing The Order',
  'Ready To Deliver',
  'On Delivery Partner',
  'Delivered',
  'Cancelled',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** The seven stages an order moves through; Cancelled is not a stage. */
export const PIPELINE_STAGES = ORDER_STATUSES.slice(0, 7) as readonly OrderStatus[]

export const CANCELLED_STATUS: OrderStatus = 'Cancelled'

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value)
}

type StatusLook = {
  slug: string
  step: string
  viewBox: string
  width: number
  glyph: () => ReactNode
}

const LOOKS: Record<OrderStatus, StatusLook> = {
  'Order Is Placed': {
    slug: 'placed',
    step: '1',
    viewBox: '0 0 14 14',
    width: 12,
    glyph: () => <circle cx="7" cy="7" r="5" strokeWidth="2.4" strokeDasharray="2.6 2.2" />,
  },
  'Order Confirmed': {
    slug: 'confirmed',
    step: '2',
    viewBox: '0 0 14 14',
    width: 12,
    glyph: () => <path d="M2 7.6l3.2 3.2L12 3.6" strokeWidth="2.6" />,
  },
  Processing: {
    slug: 'processing',
    step: '3',
    viewBox: '0 0 14 14',
    width: 12,
    glyph: () => (
      <>
        <circle cx="7" cy="7" r="5.4" strokeWidth="2" />
        <path d="M7 1.6a5.4 5.4 0 010 10.8z" fill="currentColor" stroke="none" />
      </>
    ),
  },
  'Packing The Order': {
    slug: 'packing',
    step: '4',
    viewBox: '0 0 14 14',
    width: 12,
    glyph: () => (
      <>
        <rect x="1.6" y="3.4" width="10.8" height="8.4" strokeWidth="2" />
        <path d="M1.6 6.6h10.8M7 6.6v5.2" strokeWidth="2" />
      </>
    ),
  },
  'Ready To Deliver': {
    slug: 'ready',
    step: '5',
    viewBox: '0 0 14 14',
    width: 12,
    glyph: () => <path d="M3 12.6V1.8h8.4L9.2 5.4l2.2 3.6H4.4" fill="currentColor" />,
  },
  'On Delivery Partner': {
    slug: 'partner',
    step: '6',
    viewBox: '0 0 16 14',
    width: 14,
    glyph: () => <path d="M1 7h10M8.4 3.2L12.6 7l-4.2 3.8" strokeWidth="2.4" />,
  },
  Delivered: {
    slug: 'delivered',
    step: '7',
    viewBox: '0 0 18 14',
    width: 15,
    glyph: () => <path d="M1 7.6l3 3.2 5.6-7.2M8 10.8l1 1 6-7.6" strokeWidth="2.4" />,
  },
  Cancelled: {
    slug: 'cancelled',
    step: '×',
    viewBox: '0 0 14 14',
    width: 12,
    glyph: () => <path d="M2.4 2.4l9.2 9.2M11.6 2.4l-9.2 9.2" strokeWidth="2.8" />,
  },
}

/** The 12px glyph for a status, `currentColor` throughout. */
export function StatusGlyph({ status }: { status: OrderStatus }) {
  const look = LOOKS[status]
  return (
    <svg
      className="status-glyph"
      viewBox={look.viewBox}
      width={look.width}
      height={12}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeLinecap="square"
    >
      {look.glyph()}
    </svg>
  )
}

/**
 * The status pill: step number (× for Cancelled), glyph, border band and corners, then hue.
 * An unknown status falls back to its plain text.
 */
export function StatusPill({ status }: { status: string }) {
  if (!isOrderStatus(status)) return <span className="status-pill-plain">{status}</span>
  const look = LOOKS[status]
  return (
    <span className={`status-pill status-pill-${look.slug}`}>
      <span className="status-pill-step" aria-hidden="true">
        {look.step}
      </span>
      <StatusGlyph status={status} />
      <span className="status-pill-label">{status}</span>
    </span>
  )
}
