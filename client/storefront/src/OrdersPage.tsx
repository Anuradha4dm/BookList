import { useCallback, useEffect, useRef, useState, type SVGProps } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Spinner, StatusPill, formatRupees } from '@booklist/ui'
import { useSession } from './auth'
import { CancelOrderModal, OrderDetail, parseOrderDetail, type OrderDetailData } from './OrderDetail'

const UNREACHABLE = 'Could not reach the shop. Try again.'
const LOAD_FAILED = 'Could not load your orders.'
const DETAIL_FAILED = 'Could not load this order.'
const CANCEL_FAILED = 'Could not cancel this order. Try again.'
const EMPTY_COPY = 'No Orders yet.'
/** The pipeline is pulled, never pushed: a quiet refetch every 30 seconds while visible. */
const POLL_MS = 30_000

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

type ModalTarget = { id: number; publicNumber: number }

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

function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      {...props}
    >
      <path d="M6 9l6 6 6-6" />
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
  const [openId, setOpenId] = useState<number | null>(null)
  const [detail, setDetail] = useState<OrderDetailData | undefined>(undefined)
  const [detailError, setDetailError] = useState('')
  const [modalTarget, setModalTarget] = useState<ModalTarget | null>(null)
  const inFlight = useRef(false)
  const loadController = useRef<AbortController | null>(null)
  const detailController = useRef<AbortController | null>(null)
  const openIdRef = useRef<number | null>(null)
  const modalOpen = useRef(false)
  modalOpen.current = modalTarget !== null
  const toggleRefs = useRef(new Map<number, HTMLButtonElement>())
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

  /**
   * Fetches `/api/orders`, aborting any earlier fetch. A failed refetch keeps the last good list;
   * a silent (poll) refetch that fails shows nothing at all.
   */
  const loadOrders = useCallback(async (silent = false): Promise<LoadOutcome> => {
    // A silent poll never aborts a pending load and never runs before the first load settles,
    // so it cannot swallow the first answer and leave the page loading for good.
    if (silent && (!hasLoaded.current || loadController.current !== null)) return 'aborted'
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller

    const fail = (message: string): LoadOutcome => {
      if (silent) return 'failed'
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

  /** Fetches one order's snapshot detail for the open row; a silent fetch never shows an error. */
  const loadDetail = useCallback(async (orderId: number, silent = false): Promise<void> => {
    detailController.current?.abort()
    const controller = new AbortController()
    detailController.current = controller
    const fail = (message: string) => {
      if (!silent && openIdRef.current === orderId) setDetailError(message)
    }
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        credentials: 'include',
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (response.status === 401) {
        await logOut.current()
        return
      }
      const body = (await response.json().catch(() => null)) as unknown
      if (controller.signal.aborted) return
      if (!response.ok) {
        fail(apiMessage(body as ApiError | null, DETAIL_FAILED))
        return
      }
      const parsed = parseOrderDetail(body)
      if (!parsed) {
        fail(DETAIL_FAILED)
        return
      }
      if (openIdRef.current !== orderId) return
      setDetail(parsed)
      setDetailError('')
    } catch {
      if (controller.signal.aborted) return
      fail(UNREACHABLE)
    } finally {
      if (detailController.current === controller) detailController.current = null
    }
  }, [])

  useEffect(() => {
    setStatus('loading')
    setErrorMessage('')
    void loadOrders()
    return () => {
      loadController.current?.abort()
      detailController.current?.abort()
    }
  }, [loadOrders])

  // Quiet polling: the list and any open detail, only while the page is visible, never while
  // the cancel modal is open or another change is running.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (modalOpen.current || inFlight.current) return
      if (!hasLoaded.current) return
      void loadOrders(true)
      const open = openIdRef.current
      if (open !== null && detailController.current === null) void loadDetail(open, true)
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [loadOrders, loadDetail])

  // Once the first answer has rendered, move focus to the confirmation (else the heading) so
  // a screen reader announces it.
  useEffect(() => {
    if (status === 'loading' || focusedOnce.current) return
    focusedOnce.current = true
    ;(confirmRef.current ?? headingRef.current)?.focus()
  }, [status])

  /** Runs one change or refresh at a time; the ref blocks re-entry before React re-renders. */
  const withLock = useCallback(async (task: () => Promise<void>): Promise<void> => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setActionError('')
    try {
      await task()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }, [])

  const refreshOrders = () =>
    void withLock(async () => {
      await loadOrders()
      const open = openIdRef.current
      if (open !== null) await loadDetail(open)
    })

  const toggleOrder = (orderId: number) => {
    detailController.current?.abort()
    setDetailError('')
    setDetail(undefined)
    if (openIdRef.current === orderId) {
      openIdRef.current = null
      setOpenId(null)
      return
    }
    openIdRef.current = orderId
    setOpenId(orderId)
    void loadDetail(orderId)
  }

  const focusRow = (orderId: number) => {
    const toggle = toggleRefs.current.get(orderId)
    if (toggle?.isConnected) toggle.focus()
  }

  /** The parent's cancel: one request at a time; the order stays listed either way. */
  const confirmCancel = () => {
    const target = modalTarget
    if (!target) return
    void withLock(async () => {
      let response: Response
      try {
        response = await fetch(`/api/orders/${target.id}/cancel`, {
          method: 'POST',
          credentials: 'include',
        })
      } catch {
        setModalTarget(null)
        // The cancel may still have committed: resync so a stale Placed row cannot linger.
        await loadOrders()
        if (openIdRef.current === target.id) await loadDetail(target.id)
        setActionError(UNREACHABLE)
        focusRow(target.id)
        return
      }
      if (response.status === 401) {
        setModalTarget(null)
        await logOut.current()
        return
      }
      const body = (await response.json().catch(() => null)) as unknown
      setModalTarget(null)
      if (response.ok) {
        const parsed = parseOrderDetail(body)
        if (parsed && openIdRef.current === target.id) setDetail(parsed)
        await loadOrders()
        if (!parsed && openIdRef.current === target.id) await loadDetail(target.id)
        focusRow(target.id)
        return
      }
      const message = apiMessage(body as ApiError | null, CANCEL_FAILED)
      // The shop got there first (or the order changed): resync so the Cancel button goes.
      await loadOrders()
      if (openIdRef.current === target.id) await loadDetail(target.id)
      setActionError(message)
      focusRow(target.id)
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
            const open = openId === order.id
            const detailId = `order-detail-${order.id}`
            return (
              <li key={order.id} className={justPlaced ? 'order-row is-placed' : 'order-row'}>
                {justPlaced ? placedLine : null}
                <button
                  type="button"
                  className="order-row-toggle"
                  aria-expanded={open}
                  aria-controls={open ? detailId : undefined}
                  ref={(node) => {
                    if (node) toggleRefs.current.set(order.id, node)
                    else toggleRefs.current.delete(order.id)
                  }}
                  onClick={() => toggleOrder(order.id)}
                >
                  <span className="order-row-main">
                    <span className="order-row-number text-body-strong">#{order.publicNumber}</span>
                    <span className="order-row-total text-amount-row">
                      {formatRupees(order.goodsTotal)}
                    </span>
                  </span>
                  <span className="order-row-meta text-meta">
                    <span className="order-row-meta-start">
                      <StatusPill status={order.status} />
                      <span>{placedAtCopy(order.placedAt)}</span>
                    </span>
                    <ChevronIcon className="order-row-chevron" width={20} height={20} />
                  </span>
                </button>
                {open ? (
                  <OrderDetail
                    id={detailId}
                    detail={detail?.id === order.id ? detail : undefined}
                    loadError={detailError}
                    busy={busy}
                    onCancel={() => setModalTarget({ id: order.id, publicNumber: order.publicNumber })}
                  />
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      {modalTarget ? (
        <CancelOrderModal
          publicNumber={modalTarget.publicNumber}
          busy={busy}
          onConfirm={confirmCancel}
          onClose={() => setModalTarget(null)}
        />
      ) : null}
    </section>
  )
}
