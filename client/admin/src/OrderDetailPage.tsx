import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { Skeleton, StatusPill, formatRupees, type OrderStatus } from '@booklist/ui'
import { useAdminAuth } from './auth'
import { CallChip, placedAtCopy } from './OrdersPage'
import {
  DELIVERED_STATUS,
  DELIVERY_PRICE_MESSAGE,
  MOVABLE_FROM,
  NEEDS_CALL_STATUS,
  REASON_MAX_LENGTH,
  REASON_MESSAGE,
  adminOrderCallAttemptedPath,
  adminOrderCancelPath,
  adminOrderConfirmPath,
  adminOrderPath,
  adminOrderStatusPath,
  cancelBody,
  confirmBody,
  deliveryPriceFrom,
  isTerminal,
  moveBody,
  parseAdminOrderDetail,
  reasonFrom,
  transitionAnnouncement,
  type AdminOrderDetail,
} from './orders'
import { TerminalModal } from './TerminalModal'

const UNREACHABLE = 'Could not reach the shop. Try again.'
const SIGN_IN_AGAIN = 'Sign in to continue.'
const LOAD_FAILED = 'Could not load this order. Try again.'
const ACTION_FAILED = 'Could not save that. Try again.'
const NOT_FOUND = 'Order not found.'
const PRICE_ID = 'admin-order-delivery-price'
const PRICE_ERROR_ID = 'admin-order-delivery-price-error'
const REASON_ID = 'admin-order-cancel-reason'
const MOVE_LABEL_ID = 'admin-order-move-label'
/** The order number heading: where focus lands when a final action removes its trigger. */
const HEADING_ID = 'admin-order-detail-heading'

/** Which final-action confirmation is open, if any. */
export type TerminalAction = 'delivered' | 'cancel'

const noop = () => {}

type ApiError = {
  error?: { code?: string; message?: string; field?: string }
}

function apiMessage(body: ApiError | null, fallback: string): string {
  const message = body?.error?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

/** The route's `:id` as a positive safe integer, or undefined when it cannot be an order id. */
function orderIdFrom(value: string | undefined): number | undefined {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return undefined
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : undefined
}

type ViewProps = {
  order: AdminOrderDetail
  /** The server's answer to the last action, e.g. a 409, shown as an alert. */
  notice?: string
  price: string
  priceError?: string
  busy?: boolean
  /** The clock the call chip compares against; defaults to now. */
  now?: number
  onPriceChange: (next: string) => void
  onMarkCall: () => void
  onConfirm: () => void
  /** The open final-action confirmation; closed when absent. */
  modal?: TerminalAction | null
  /** The cancel reason as typed, kept across a refused submit. */
  reason?: string
  reasonError?: string
  /** A failure inside the open modal that is not about the reason. */
  modalError?: string
  /** The outcome of the last successful move, deliver or cancel, read out politely. */
  announcement?: string
  onMove?: (to: OrderStatus) => void
  onOpenModal?: (action: TerminalAction) => void
  onReasonChange?: (next: string) => void
  onModalConfirm?: () => void
  onModalClose?: () => void
}

/**
 * One order as the shop sees it. Only a placed order carries the call and confirm controls; any
 * non-final order carries the status controls, and a cancelled one says who cancelled and why.
 */
export function AdminOrderDetailView({
  order,
  notice,
  price,
  priceError,
  busy,
  now,
  onPriceChange,
  onMarkCall,
  onConfirm,
  modal = null,
  reason = '',
  reasonError,
  modalError,
  announcement = '',
  onMove = noop,
  onOpenModal = noop,
  onReasonChange = noop,
  onModalConfirm = noop,
  onModalClose = noop,
}: ViewProps) {
  const placed = order.status === NEEDS_CALL_STATUS
  const terminal = isTerminal(order.status)
  const movable = MOVABLE_FROM.includes(order.status)
  const targets = MOVABLE_FROM.filter((status) => status !== order.status)
  const cancellation = order.cancellation
  const guarded = (run: () => void) => () => {
    if (!busy) run()
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onConfirm()
  }

  return (
    <>
      <div className="admin-order-detail-heading">
        <h1 className="admin-order-detail-number page-heading text-heading-lg" id={HEADING_ID} tabIndex={-1}>
          #{order.publicNumber}
        </h1>
        <StatusPill status={order.status} />
      </div>
      <p className="admin-order-detail-placed text-meta">Placed {placedAtCopy(order.placedAt)}</p>

      {notice ? (
        <div className="admin-order-detail-notice notice notice-danger" role="alert">
          <p className="notice-body">{notice}</p>
        </div>
      ) : null}
      {/* Always in the DOM, so a new outcome is announced; no motion. */}
      <p className="admin-order-detail-announce visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      <section className="admin-order-detail-section" aria-label="Parent">
        <span className="text-label-caps">Parent</span>
        <p className="admin-order-detail-name text-body-strong">{order.parentName}</p>
        <p className="admin-order-detail-contact">WhatsApp {order.whatsapp}</p>
        {order.secondPhone !== null ? (
          <p className="admin-order-detail-contact">Second phone {order.secondPhone}</p>
        ) : null}
      </section>

      <section className="admin-order-detail-section" aria-label="Delivery">
        <span className="text-label-caps">Delivery address</span>
        <p className="admin-order-detail-address">{order.deliveryAddress}</p>
        {order.note ? <p className="admin-order-detail-note text-meta">Note: {order.note}</p> : null}
      </section>

      <section className="admin-order-detail-section" aria-label="Lines">
        <ul className="admin-order-detail-lines">
          {order.packLines.map((line, index) => (
            <li key={`pack-${index}`} className="admin-order-detail-line">
              <div className="admin-order-detail-line-main">
                <span className="text-body-strong">{line.packName}</span>
                <span className="text-amount-row">{formatRupees(line.lineTotal)}</span>
              </div>
              <span className="admin-order-detail-line-meta text-meta">
                {line.gradeName} · {line.label}
              </span>
              <ul className="admin-order-detail-books text-meta">
                {line.books.map((book, bookIndex) => (
                  <li key={bookIndex} className="admin-order-detail-book">
                    <span>
                      {book.title} ×{book.quantity}
                    </span>
                    <span>{formatRupees(book.unitPrice)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {order.itemLines.map((line, index) => (
            <li key={`item-${index}`} className="admin-order-detail-line">
              <div className="admin-order-detail-line-main">
                <span className="text-body-strong">{line.title}</span>
                <span className="text-amount-row">{formatRupees(line.lineTotal)}</span>
              </div>
              <span className="admin-order-detail-line-meta text-meta">
                {formatRupees(line.unitPrice)} ×{line.quantity}
              </span>
            </li>
          ))}
        </ul>
        <div className="admin-order-detail-totals">
          <div className="admin-order-detail-total">
            <span className="text-body-strong">Goods total</span>
            <span className="text-amount-row">{formatRupees(order.goodsTotal)}</span>
          </div>
          {order.deliveryPrice !== null ? (
            <div className="admin-order-detail-total">
              <span className="text-body-strong">Delivery charge</span>
              <span className="text-amount-row">{formatRupees(order.deliveryPrice)}</span>
            </div>
          ) : null}
          {order.payableTotal !== null ? (
            <div className="admin-order-detail-total">
              <span className="text-body-strong">Payable total</span>
              <span className="text-amount-row">{formatRupees(order.payableTotal)}</span>
            </div>
          ) : null}
        </div>
      </section>

      {placed ? (
        <>
          <section className="admin-order-detail-section admin-order-detail-call" aria-label="Call">
            <CallChip callAttemptedAt={order.callAttemptedAt} now={now} />
            <button
              type="button"
              className="button-secondary press-travel"
              aria-disabled={busy ? 'true' : undefined}
              onClick={() => {
                if (!busy) onMarkCall()
              }}
            >
              Mark call attempted
            </button>
          </section>

          <form
            className="admin-order-detail-section admin-order-detail-confirm"
            aria-label="Confirm order"
            noValidate
            onSubmit={submit}
          >
            <div className={priceError ? 'form-field is-invalid' : 'form-field'}>
              <label className="text-label-caps" htmlFor={PRICE_ID}>
                Delivery charge
              </label>
              <div className="form-field-money">
                <span className="form-field-money-prefix" aria-hidden="true">
                  Rs.
                </span>
                <input
                  id={PRICE_ID}
                  className="form-control text-amount-row"
                  type="text"
                  name="deliveryPrice"
                  inputMode="numeric"
                  autoComplete="off"
                  value={price}
                  aria-invalid={priceError ? true : undefined}
                  aria-describedby={priceError ? PRICE_ERROR_ID : undefined}
                  onChange={(event) => {
                    const next = event.target.value
                    if (/^\d*$/.test(next)) onPriceChange(next)
                  }}
                />
              </div>
            </div>
            {priceError ? (
              <p id={PRICE_ERROR_ID} className="form-error text-meta" role="alert">
                {priceError}
              </p>
            ) : null}
            <button
              type="submit"
              className="button-primary press-travel"
              aria-disabled={busy ? 'true' : undefined}
            >
              Confirm order
            </button>
          </form>
        </>
      ) : null}

      {!terminal ? (
        <section className="admin-order-detail-section admin-order-detail-status" aria-label="Status">
          <span className="text-label-caps">Status</span>
          {movable ? (
            <>
              <span className="admin-order-detail-status-label text-meta" id={MOVE_LABEL_ID}>
                Move to
              </span>
              <div className="admin-order-detail-status-group" role="group" aria-labelledby={MOVE_LABEL_ID}>
                {targets.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className="button-secondary press-travel"
                    aria-disabled={busy ? 'true' : undefined}
                    onClick={guarded(() => onMove(status))}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <div className="admin-order-detail-status-final">
            {movable ? (
              <button
                type="button"
                className="button-primary press-travel"
                aria-disabled={busy ? 'true' : undefined}
                onClick={guarded(() => onOpenModal('delivered'))}
              >
                Mark delivered
              </button>
            ) : null}
            <button
              type="button"
              className="button-secondary press-travel admin-order-detail-cancel"
              aria-disabled={busy ? 'true' : undefined}
              onClick={guarded(() => onOpenModal('cancel'))}
            >
              Cancel order
            </button>
          </div>
        </section>
      ) : null}

      {cancellation ? (
        <section className="admin-order-detail-section admin-order-detail-cancelled" aria-label="Cancellation">
          <p className="text-body-strong">
            {cancellation.by === 'parent' ? 'Cancelled by the parent.' : 'Cancelled by the shop.'}
          </p>
          {cancellation.reason?.trim() ? (
            <p className="admin-order-detail-reason">Reason: {cancellation.reason}</p>
          ) : null}
        </section>
      ) : null}

      {modal === 'delivered' && !terminal ? (
        <TerminalModal
          title={`Mark #${order.publicNumber} delivered?`}
          body="Delivered is final. This order can't be moved again."
          confirmLabel="Mark delivered"
          dismissLabel="Cancel"
          busy={!!busy}
          error={modalError}
          fallbackFocusId={HEADING_ID}
          onConfirm={onModalConfirm}
          onClose={onModalClose}
        />
      ) : null}
      {modal === 'cancel' && !terminal ? (
        <TerminalModal
          title={`Cancel #${order.publicNumber}?`}
          body="Cancelled is final. The parent will see your reason."
          confirmLabel="Cancel order"
          dismissLabel="Keep order"
          busy={!!busy}
          field={{
            id: REASON_ID,
            label: 'Reason for the parent',
            value: reason,
            maxLength: REASON_MAX_LENGTH,
            error: reasonError,
            onChange: onReasonChange,
          }}
          error={modalError}
          fallbackFocusId={HEADING_ID}
          onConfirm={onModalConfirm}
          onClose={onModalClose}
        />
      ) : null}
    </>
  )
}

/**
 * The `orders/:id` route element. Keyed by the id, so moving to another order remounts the page
 * and no order, notice or typed price carries over from the previous one.
 */
export function OrderDetailRoute() {
  const params = useParams()
  return <OrderDetailPage key={params.id ?? ''} />
}

export function OrderDetailPage() {
  const { signOut } = useAdminAuth()
  const params = useParams()
  const orderId = orderIdFrom(params.id)
  const [order, setOrder] = useState<AdminOrderDetail | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [price, setPrice] = useState('')
  const [priceError, setPriceError] = useState('')
  const [modal, setModal] = useState<TerminalAction | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [modalError, setModalError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [acting, setActing] = useState(false)
  const actingRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  const actionControllerRef = useRef<AbortController | null>(null)
  // Bumped by every load and action, so an older answer never overwrites a newer one.
  const versionRef = useRef(0)
  const signOutRef = useRef(signOut)
  signOutRef.current = signOut

  /** Closes the modal but keeps the typed reason, so reopening Cancel order restores it. */
  const hideModal = useCallback((): void => {
    setModal(null)
    setReasonError('')
    setModalError('')
  }, [])

  /** Closes the modal and drops the reason: after a successful cancel, or an explicit dismiss. */
  const closeModal = useCallback((): void => {
    hideModal()
    setReason('')
  }, [hideModal])

  const signOutHere = useCallback(async (): Promise<void> => {
    // Drop the order first so no parent contacts linger behind the sign-in prompt.
    setOrder(undefined)
    setNotice('')
    closeModal()
    try {
      await signOutRef.current()
    } catch {
      // Signing out locally failed too; the prompt below is still the right message.
    }
    setError(SIGN_IN_AGAIN)
  }, [closeModal])

  /** No such order: drop whatever was shown, so no controls act on it. */
  const showNotFound = useCallback((message: string): void => {
    setOrder(undefined)
    setNotice('')
    closeModal()
    setError(message)
  }, [closeModal])

  /** Fetches the order, aborting any earlier fetch; a failed refetch keeps the last good order. */
  const load = useCallback(async (): Promise<void> => {
    controllerRef.current?.abort()
    if (orderId === undefined) {
      showNotFound(NOT_FOUND)
      setLoaded(true)
      return
    }
    const version = ++versionRef.current
    const controller = new AbortController()
    controllerRef.current = controller
    const stale = () => controller.signal.aborted || versionRef.current !== version
    try {
      const response = await fetch(adminOrderPath(orderId), {
        credentials: 'include',
        signal: controller.signal,
      })
      if (stale()) return
      if (response.status === 401) {
        await signOutHere()
        return
      }
      const body = (await response.json().catch(() => null)) as unknown
      if (stale()) return
      if (response.status === 404) {
        showNotFound(apiMessage(body as ApiError | null, NOT_FOUND))
        return
      }
      if (!response.ok) {
        setError(apiMessage(body as ApiError | null, LOAD_FAILED))
        return
      }
      const parsed = parseAdminOrderDetail(body)
      if (!parsed) {
        setError(LOAD_FAILED)
        return
      }
      setOrder(parsed)
      setError('')
    } catch {
      if (stale()) return
      setError(UNREACHABLE)
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setLoaded(true)
      }
    }
  }, [orderId, signOutHere, showNotFound])

  useEffect(() => {
    void load()
    return () => {
      controllerRef.current?.abort()
      actionControllerRef.current?.abort()
    }
  }, [load])

  /**
   * Runs one action; a second tap while one is in flight does nothing. `announce` turns a
   * successful answer into the polite live-region copy.
   */
  const act = async (
    path: string,
    body?: unknown,
    announce?: (order: AdminOrderDetail) => string,
  ): Promise<void> => {
    if (actingRef.current) return
    actingRef.current = true
    setActing(true)
    setNotice('')
    setModalError('')
    setAnnouncement('')
    // A failure that is not a 409 stays inside an open modal, so the typed reason is kept.
    const inModal = modal !== null
    // An action supersedes any load still in flight.
    controllerRef.current?.abort()
    const version = ++versionRef.current
    const controller = new AbortController()
    actionControllerRef.current = controller
    const stale = () => controller.signal.aborted || versionRef.current !== version
    try {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (stale()) return
      if (response.status === 401) {
        await signOutHere()
        return
      }
      const json = (await response.json().catch(() => null)) as unknown
      if (stale()) return
      const failure = json as ApiError | null
      if (response.ok) {
        const parsed = parseAdminOrderDetail(json)
        if (!parsed) {
          setNotice(ACTION_FAILED)
          return
        }
        setOrder(parsed)
        setError('')
        setPrice('')
        setPriceError('')
        closeModal()
        if (announce) setAnnouncement(announce(parsed))
        return
      }
      if (response.status === 404) {
        showNotFound(apiMessage(failure, NOT_FOUND))
        return
      }
      if (response.status === 409) {
        // Someone else moved the order first: say why, then show where it is now. Busy holds
        // until the refetch lands, so no control looks live on an order that has moved on. The
        // modal closes first so the explanation is not hidden behind it; the typed reason is kept.
        hideModal()
        setNotice(apiMessage(failure, ACTION_FAILED))
        await load()
        return
      }
      if (response.status === 400 && failure?.error?.field === 'deliveryPrice') {
        setPriceError(apiMessage(failure, DELIVERY_PRICE_MESSAGE))
        return
      }
      if (response.status === 400 && failure?.error?.field === 'reason') {
        // The modal stays open with the typed text, and the reason says what is wrong.
        setReasonError(apiMessage(failure, REASON_MESSAGE))
        return
      }
      if (inModal) setModalError(apiMessage(failure, ACTION_FAILED))
      else setNotice(apiMessage(failure, ACTION_FAILED))
    } catch {
      if (stale()) return
      if (inModal) setModalError(UNREACHABLE)
      else setNotice(UNREACHABLE)
    } finally {
      if (actionControllerRef.current === controller) actionControllerRef.current = null
      if (!controller.signal.aborted) {
        actingRef.current = false
        setActing(false)
      }
    }
  }

  const markCall = () => {
    if (orderId === undefined) return
    void act(adminOrderCallAttemptedPath(orderId))
  }

  const confirm = () => {
    if (orderId === undefined || actingRef.current) return
    const deliveryPrice = deliveryPriceFrom(price)
    if (deliveryPrice === undefined) {
      setPriceError(DELIVERY_PRICE_MESSAGE)
      return
    }
    setPriceError('')
    void act(adminOrderConfirmPath(orderId), confirmBody(deliveryPrice))
  }

  const announceOutcome = (next: AdminOrderDetail) => transitionAnnouncement(next.status)

  /** A non-final move: no modal, the pill updates in place when the answer lands. */
  const move = (to: OrderStatus) => {
    if (orderId === undefined || !order || actingRef.current) return
    void act(adminOrderStatusPath(orderId), moveBody(order.status, to), announceOutcome)
  }

  const openModal = (action: TerminalAction) => {
    if (actingRef.current) return
    setNotice('')
    setAnnouncement('')
    // The reason is not reset here: one kept from a 409 comes back when Cancel order reopens.
    setReasonError('')
    setModalError('')
    setModal(action)
  }

  const confirmModal = () => {
    if (orderId === undefined || !order || actingRef.current) return
    if (modal === 'delivered') {
      void act(adminOrderStatusPath(orderId), moveBody(order.status, DELIVERED_STATUS), announceOutcome)
      return
    }
    if (modal === 'cancel') {
      const trimmed = reasonFrom(reason)
      if (trimmed === undefined) {
        setReasonError(REASON_MESSAGE)
        return
      }
      setReasonError('')
      void act(adminOrderCancelPath(orderId), cancelBody(order.status, trimmed), announceOutcome)
    }
  }

  return (
    <section className="admin-order-detail">
      <Link className="admin-order-detail-back" to="/">
        All orders
      </Link>
      {!loaded ? (
        <Skeleton />
      ) : (
        <>
          {error ? (
            <p className="form-error text-meta" role="alert">
              {error}
            </p>
          ) : null}
          {order ? (
            <AdminOrderDetailView
              order={order}
              notice={notice}
              price={price}
              priceError={priceError}
              busy={acting}
              onPriceChange={(next) => {
                setPrice(next)
                if (priceError) setPriceError('')
              }}
              onMarkCall={markCall}
              onConfirm={confirm}
              modal={modal}
              reason={reason}
              reasonError={reasonError}
              modalError={modalError}
              announcement={announcement}
              onMove={move}
              onOpenModal={openModal}
              onReasonChange={(next) => {
                setReason(next)
                if (reasonError) setReasonError('')
              }}
              onModalConfirm={confirmModal}
              onModalClose={() => {
                if (!actingRef.current) closeModal()
              }}
            />
          ) : null}
        </>
      )}
    </section>
  )
}
