import { useCallback, useEffect, useRef, useState, type SVGProps } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Spinner, formatRupees } from '@booklist/ui'
import { useSession } from './auth'

const UNREACHABLE = 'Could not reach the shop. Try again.'
const LOAD_FAILED = 'Could not load your orders.'
const EMPTY_COPY = 'No Orders yet.'

type Status = 'loading' | 'ready' | 'error'

type LoadOutcome = 'ok' | 'failed' | 'aborted'

type ApiError = {
  error?: { message?: string }
}

type OrderRow = {
  id: number
  publicNumber: number
  status: string
  goodsTotal: number
  placedAt: string
}

function apiMessage(body: ApiError | null, fallback: string): string {
  const message = body?.error?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

function isOrderRow(value: unknown): value is OrderRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'number' &&
    typeof row.publicNumber === 'number' &&
    typeof row.status === 'string' &&
    typeof row.goodsTotal === 'number' &&
    typeof row.placedAt === 'string'
  )
}

function parseOrdersBody(body: unknown): OrderRow[] | undefined {
  const orders = (body as { orders?: unknown } | null)?.orders
  if (!Array.isArray(orders) || !orders.every(isOrderRow)) return undefined
  return orders
}

const PLACED_AT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Colombo',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function placedAtCopy(placedAt: string): string {
  const time = Date.parse(placedAt)
  return Number.isNaN(time) ? placedAt : PLACED_AT.format(time)
}

/** The number Place Order hands over on arrival, if any. */
function placedNumberFrom(state: unknown): number | undefined {
  const value = (state as { placedNumber?: unknown } | null)?.placedNumber
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
}

function RefreshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor" {...props}>
      <path
        d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M20 3.5v5.5h-5.5z" />
    </svg>
  )
}

export function OrdersPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const session = useSession()
  // Read once on arrival; the history entry is then cleared so a reload never repeats it.
  const [placedNumber] = useState(() => placedNumberFrom(location.state))
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const loadController = useRef<AbortController | null>(null)
  const hasLoaded = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const confirmRef = useRef<HTMLHeadingElement>(null)
  const focusedOnce = useRef(false)
  const logOut = useRef(session.logOut)
  logOut.current = session.logOut

  useEffect(() => {
    if (location.state != null) {
      void navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])

  /** Fetches `/api/orders`, aborting any earlier fetch. A failed refetch keeps the last good list. */
  const loadOrders = useCallback(async (): Promise<LoadOutcome> => {
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller

    const fail = (message: string): LoadOutcome => {
      if (!hasLoaded.current) {
        setErrorMessage(message)
        setStatus('error')
      } else {
        setActionError(message)
        setStatus('ready')
      }
      return 'failed'
    }

    try {
      const response = await fetch('/api/orders', {
        credentials: 'include',
        signal: controller.signal,
      })
      if (controller.signal.aborted) return 'aborted'
      if (response.status === 401) {
        // The session is gone: AuthGate takes over and signing in again lands on packs.
        await logOut.current()
        return 'failed'
      }
      const body = (await response.json().catch(() => null)) as unknown
      if (controller.signal.aborted) return 'aborted'
      if (!response.ok) return fail(apiMessage(body as ApiError | null, LOAD_FAILED))
      const parsed = parseOrdersBody(body)
      if (!parsed) return fail(LOAD_FAILED)
      setOrders(parsed)
      setStatus('ready')
      hasLoaded.current = true
      return 'ok'
    } catch {
      if (controller.signal.aborted) return 'aborted'
      return fail(UNREACHABLE)
    } finally {
      if (loadController.current === controller) loadController.current = null
    }
  }, [])

  useEffect(() => {
    setStatus('loading')
    setErrorMessage('')
    void loadOrders()
    return () => loadController.current?.abort()
  }, [loadOrders])

  // Once the first answer has rendered, move focus to the confirmation (else the heading) so
  // a screen reader announces it.
  useEffect(() => {
    if (status === 'loading' || focusedOnce.current) return
    focusedOnce.current = true
    ;(confirmRef.current ?? headingRef.current)?.focus()
  }, [status])

  /** One refresh at a time; the ref blocks re-entry before React re-renders. */
  const refreshOrders = () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setActionError('')
    void loadOrders().finally(() => {
      inFlight.current = false
      setBusy(false)
    })
  }

  if (status === 'loading') return <Spinner />

  const placedLine =
    placedNumber === undefined ? null : (
      <h2 className="order-row-placed text-heading-sm" tabIndex={-1} ref={confirmRef}>
        Order #{placedNumber} placed.
      </h2>
    )
  const placedRowListed =
    status === 'ready' && orders.some((order) => order.publicNumber === placedNumber)

  const refreshButton = (
    <button
      type="button"
      className="cart-refresh"
      aria-label="Refresh orders"
      disabled={busy}
      onClick={refreshOrders}
    >
      <RefreshIcon width={24} height={24} />
    </button>
  )

  if (status === 'error') {
    return (
      <section className="orders-screen">
        <h1 className="page-heading text-heading-lg" tabIndex={-1} ref={headingRef}>
          My Orders
        </h1>
        {placedLine}
        <div className="cart-empty">
          <p className="form-error text-meta" role="alert">
            {errorMessage}
          </p>
          {refreshButton}
        </div>
      </section>
    )
  }

  return (
    <section className="orders-screen">
      <h1 className="page-heading text-heading-lg" tabIndex={-1} ref={headingRef}>
        My Orders
      </h1>
      {placedRowListed ? null : placedLine}
      {actionError ? (
        <p className="form-error text-meta" role="alert">
          {actionError}
        </p>
      ) : null}
      {orders.length === 0 ? (
        <div className="cart-empty">
          <p className="cart-empty-copy text-heading-sm">{EMPTY_COPY}</p>
          {refreshButton}
        </div>
      ) : (
        <ul className="order-list">
          {orders.map((order) => {
            const justPlaced = order.publicNumber === placedNumber
            return (
              <li key={order.id} className={justPlaced ? 'order-row is-placed' : 'order-row'}>
                {justPlaced ? placedLine : null}
                <div className="order-row-main">
                  <span className="order-row-number text-body-strong">#{order.publicNumber}</span>
                  <span className="order-row-total text-amount-row">
                    {formatRupees(order.goodsTotal)}
                  </span>
                </div>
                <div className="order-row-meta text-meta">
                  <span>{order.status}</span>
                  <span>{placedAtCopy(order.placedAt)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
