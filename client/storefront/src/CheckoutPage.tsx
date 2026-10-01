import { useCallback, useEffect, useRef, useState, type SVGProps } from 'react'
import { useNavigate } from 'react-router'
import { Spinner, formatRupees } from '@booklist/ui'
import type { ProfileResponse } from './accountProfile'
import { useSession } from './auth'
import { useCartBadge, type CheckoutLine } from './cart'
import {
  acceptPriceRequest,
  compositionMeta,
  parseCheckoutBody,
  type CheckoutSnapshot,
} from './cartLines'

const UNREACHABLE = 'Could not reach the shop. Try again.'
const LOAD_FAILED = 'Could not load checkout.'
const EMPTY_COPY = 'Cart is Empty'
const DELIVERY_COPY = 'Delivery charge: to be confirmed by the shop'
const BLOCKED_REASON = 'Resolve the lines marked above before you place this order.'
const BLOCKED_REASON_ID = 'checkout-place-reason'
const ACCEPT_FAILED = 'Could not accept that price.'
const PLACE_FAILED = 'Could not place this order. Try again.'

type Status = 'loading' | 'ready' | 'error'

type LoadOutcome = 'ok' | 'failed' | 'aborted'

type ApiError = {
  error?: { message?: string }
}

function apiMessage(body: ApiError | null, fallback: string): string {
  const message = body?.error?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

/** The order number from a Place answer, or undefined when the body is not one. */
function placedNumberOf(body: unknown): number | undefined {
  const order = (body as { order?: { publicNumber?: unknown } } | null)?.order
  const value = order?.publicNumber
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
}

function attentionCopy(count: number): string {
  return count === 1 ? '1 line still needs attention' : `${count} lines still need attention`
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

function lineName(line: CheckoutLine): string {
  return line.kind === 'pack' ? line.label : line.title
}

type NoticeProps = {
  line: CheckoutLine
  busy: boolean
  onAccept: (line: CheckoutLine) => void
  onRemove: (line: CheckoutLine) => void
}

/** The inline staleness notice for one line: shown in place, never a silent fix. */
function StaleNotice({ line, busy, onAccept, onRemove }: NoticeProps) {
  const stale = line.stale
  if (!stale) return null
  if (stale.kind === 'unavailable') {
    return (
      <div className="notice notice-danger">
        <p className="notice-title text-heading-sm">No longer available</p>
        <p className="notice-body">
          {lineName(line)} has changed in the shop and cannot be ordered as it is. Remove this
          line to continue.
        </p>
        <div className="notice-actions">
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => onRemove(line)}
          >
            Remove this line
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="notice notice-warning">
      <p className="notice-title text-heading-sm">The price changed</p>
      <p className="notice-body">
        {stale.lineTotal === line.lineTotal ? (
          <>
            Book prices on {lineName(line)} changed; the line total is still{' '}
            {formatRupees(stale.lineTotal)}.
          </>
        ) : (
          <>
            {lineName(line)} was {formatRupees(line.lineTotal)} when you added it and is now{' '}
            {formatRupees(stale.lineTotal)}.
          </>
        )}
      </p>
      <div className="notice-actions">
        <button
          type="button"
          className="button-primary notice-action-primary"
          disabled={busy}
          onClick={() => onAccept(line)}
        >
          Accept {formatRupees(stale.lineTotal)}
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={busy}
          onClick={() => onRemove(line)}
        >
          Remove this line
        </button>
      </div>
    </div>
  )
}

export function CheckoutPage() {
  const { refresh } = useCartBadge()
  const session = useSession()
  const navigate = useNavigate()
  /** One Idempotency-Key per mount, reused on every retry; never stored in the browser. */
  const placeKey = useRef<string | null>(null)
  if (placeKey.current === null) placeKey.current = crypto.randomUUID()
  /** The mount's key; made here only if the ref is somehow empty, so no request sends a blank key. */
  const ensurePlaceKey = (): string => {
    if (!placeKey.current) placeKey.current = crypto.randomUUID()
    return placeKey.current
  }
  const [snapshot, setSnapshot] = useState<CheckoutSnapshot | null>(null)
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const loadController = useRef<AbortController | null>(null)
  const hasLoaded = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  /** Set after a successful change, whose clicked button may be gone after the refetch. */
  const focusAfterChange = useRef(false)

  /**
   * Fetches checkout and the account profile together, aborting any earlier fetch. The last
   * good checkout stays on screen (and the typed note stays in state) if a refetch fails.
   */
  const loadCheckout = useCallback(async (): Promise<LoadOutcome> => {
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
      const [checkoutResponse, profileResponse] = await Promise.all([
        fetch('/api/cart/checkout', { credentials: 'include', signal: controller.signal }),
        fetch('/api/parents/me', { credentials: 'include', signal: controller.signal }),
      ])
      const checkoutBody = (await checkoutResponse.json().catch(() => null)) as unknown
      const profileBody = (await profileResponse.json().catch(() => null)) as unknown
      if (controller.signal.aborted) return 'aborted'
      if (!checkoutResponse.ok) {
        return fail(apiMessage(checkoutBody as ApiError | null, LOAD_FAILED))
      }
      if (!profileResponse.ok) {
        return fail(apiMessage(profileBody as ApiError | null, LOAD_FAILED))
      }
      const parsed = parseCheckoutBody(checkoutBody)
      const profile = profileBody as ProfileResponse | null
      if (!parsed || !profile || typeof profile.deliveryAddress !== 'string') {
        return fail(LOAD_FAILED)
      }
      setSnapshot(parsed)
      setAddress(profile.deliveryAddress)
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
    void loadCheckout()
    return () => loadController.current?.abort()
  }, [loadCheckout])

  // Once the refetch has rendered and the lock is released, move focus off the vanished
  // button: to the banner while lines still need attention, else to the page heading.
  useEffect(() => {
    if (busy || !focusAfterChange.current) return
    focusAfterChange.current = false
    ;(bannerRef.current ?? headingRef.current)?.focus()
  }, [busy, snapshot])

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

  const runChange = (url: string, init: RequestInit, fallback: string) =>
    void withLock(async () => {
      let response: Response
      try {
        response = await fetch(url, { credentials: 'include', ...init })
      } catch {
        setActionError(UNREACHABLE)
        return
      }
      let changeError = ''
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiError | null
        changeError = apiMessage(body, fallback)
      }
      // Either way, resync with the server so every flag shown matches it. The typed note
      // stays in state. A failed change keeps its own message even when the refetch fails too.
      const outcome = await loadCheckout()
      if (changeError) {
        setActionError(changeError)
      } else if (outcome === 'ok') {
        focusAfterChange.current = true
      }
      refresh()
    })

  const removeLine = (line: CheckoutLine) =>
    runChange(
      line.kind === 'pack' ? `/api/cart/packs/${line.id}` : `/api/cart/items/${line.id}`,
      { method: 'DELETE' },
      'Could not remove that line.',
    )

  const acceptLine = (line: CheckoutLine) => {
    const request = acceptPriceRequest(line)
    if (!request) {
      setActionError(ACCEPT_FAILED)
      return
    }
    runChange(
      request.url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request.body),
      },
      ACCEPT_FAILED,
    )
  }

  const placeOrder = (blocked: boolean) => {
    // A blocked button stays focusable and announced, but its click does nothing.
    if (blocked) return
    void withLock(async () => {
      let response: Response
      try {
        response = await fetch('/api/orders', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            'Idempotency-Key': ensurePlaceKey(),
          },
          body: JSON.stringify({ note }),
        })
      } catch {
        setActionError(UNREACHABLE)
        return
      }
      if (response.status === 401) {
        // The cart stays on the server; signing in again lands on packs.
        await session.logOut()
        return
      }
      const body = (await response.json().catch(() => null)) as unknown
      if (!response.ok) {
        const message = apiMessage(body as ApiError | null, PLACE_FAILED)
        // A refused Place (a line went stale, or the cart emptied elsewhere): show what changed.
        // The resync runs first so its own outcome can never replace the Place message.
        if (response.status === 409) await loadCheckout()
        setActionError(message)
        return
      }
      // Any 2xx means the order exists and the cart is empty, even if the body is unreadable.
      refresh()
      const placedNumber = placedNumberOf(body)
      void navigate('/orders', placedNumber === undefined ? {} : { state: { placedNumber } })
    })
  }

  const refreshCheckout = () =>
    void withLock(async () => {
      if ((await loadCheckout()) === 'ok') refresh()
    })

  if (status === 'error') {
    return (
      <section>
        <p className="form-error text-meta" role="alert">
          {errorMessage}
        </p>
      </section>
    )
  }
  if (status === 'loading' || !snapshot) return <Spinner />

  const { lines, goodsTotal, attentionCount } = snapshot
  const blocked = attentionCount > 0

  return (
    <section className="checkout-screen">
      <h1 className="page-heading text-heading-lg" tabIndex={-1} ref={headingRef}>
        Checkout
      </h1>
      {actionError ? (
        <p className="form-error text-meta" role="alert">
          {actionError}
        </p>
      ) : null}
      {lines.length === 0 ? (
        <div className="cart-empty">
          <p className="cart-empty-copy text-heading-sm">{EMPTY_COPY}</p>
          <button
            type="button"
            className="cart-refresh"
            aria-label="Refresh checkout"
            disabled={busy}
            onClick={refreshCheckout}
          >
            <RefreshIcon width={24} height={24} />
          </button>
        </div>
      ) : (
        <>
          <div className="checkout-banner-region" aria-live="polite">
            {blocked ? (
              <div className="notice notice-danger checkout-banner" tabIndex={-1} ref={bannerRef}>
                <p className="notice-title text-heading-sm">{attentionCopy(attentionCount)}</p>
                <p className="notice-body">
                  Prices and titles are never changed for you. Accept or remove each marked line.
                </p>
              </div>
            ) : null}
          </div>
          <ul className="cart-line-list">
            {lines.map((line) => (
              <li key={`${line.kind}-${line.id}`} className="cart-line">
                {line.kind === 'pack' ? (
                  <>
                    <span
                      className={
                        line.sequence === 1 ? 'cart-line-chip is-first' : 'cart-line-chip is-later'
                      }
                    >
                      {line.label}
                    </span>
                    <p className="cart-line-meta text-meta">{compositionMeta(line)}</p>
                  </>
                ) : (
                  <>
                    <p className="cart-item-line text-body-strong">{line.title}</p>
                    <p className="cart-member-unit text-meta">
                      {line.quantity} × {formatRupees(line.unitPrice)}
                    </p>
                  </>
                )}
                <div className="cart-line-footer">
                  <span className="cart-line-total text-amount-row">
                    {formatRupees(line.lineTotal)}
                  </span>
                </div>
                <StaleNotice line={line} busy={busy} onAccept={acceptLine} onRemove={removeLine} />
              </li>
            ))}
          </ul>
          <p className="checkout-delivery-strip text-body-strong">{DELIVERY_COPY}</p>
          <div className="cart-goods-total">
            <span className="text-body-strong">Goods total</span>
            <span className="cart-goods-total-amount text-amount-row">
              {formatRupees(goodsTotal)}
            </span>
          </div>
          <div className="checkout-address">
            <h2 className="text-label-caps checkout-section-label">Delivery address</h2>
            <p className="checkout-address-text">{address}</p>
          </div>
          <div className="form-field checkout-note">
            <label className="text-label-caps" htmlFor="checkout-note">
              Delivery note (optional)
            </label>
            <textarea
              id="checkout-note"
              className="form-control checkout-note-control"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className="checkout-place">
            {/* Same element and position whether blocked or not; only its look and ARIA change. */}
            <button
              type="button"
              className={blocked ? 'button-primary button-blocked' : 'button-primary'}
              aria-disabled={blocked ? 'true' : undefined}
              aria-describedby={blocked ? BLOCKED_REASON_ID : undefined}
              aria-busy={busy ? 'true' : undefined}
              onClick={() => placeOrder(blocked)}
            >
              Place Order
            </button>
            {blocked ? (
              <p className="checkout-place-reason text-meta" id={BLOCKED_REASON_ID}>
                {BLOCKED_REASON}
              </p>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}
