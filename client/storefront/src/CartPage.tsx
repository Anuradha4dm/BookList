import { useCallback, useEffect, useRef, useState, type SVGProps } from 'react'
import { Link } from 'react-router'
import { Spinner, formatRupees } from '@booklist/ui'
import { useCartBadge, type CartLine } from './cart'
import { compositionMeta, parseCartBody, type CartSnapshot } from './cartLines'
import { QUANTITY_MAX, QUANTITY_MIN } from './packConfig'

const UNREACHABLE = 'Could not reach the shop. Try again.'
const LOAD_FAILED = 'Could not load the cart.'
const CAP_COPY = 'Item count exeeded, you can only order 20 per item'
const EMPTY_COPY = 'Cart is Empty'

type Status = 'loading' | 'ready' | 'error'

type LoadOutcome = 'ok' | 'failed' | 'aborted'

type ApiError = {
  error?: { message?: string }
}

function apiMessage(body: ApiError | null, fallback: string): string {
  const message = body?.error?.message
  return typeof message === 'string' && message.trim() ? message : fallback
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

type StepperProps = {
  title: string
  quantity: number
  disabled: boolean
  capNoticeId: string
  onChange: (quantity: number) => void
}

function QuantityStepper({ title, quantity, disabled, capNoticeId, onChange }: StepperProps) {
  const atCap = quantity >= QUANTITY_MAX
  return (
    <div className="pack-stepper">
      <button
        type="button"
        className="pack-stepper-end"
        disabled={disabled || quantity <= QUANTITY_MIN}
        onClick={() => onChange(quantity - 1)}
        aria-label={`Fewer copies of ${title}`}
      >
        {'−'}
      </button>
      <span className="pack-stepper-value text-amount-row">{quantity}</span>
      <button
        type="button"
        className="pack-stepper-end"
        disabled={disabled || quantity >= QUANTITY_MAX}
        aria-describedby={atCap ? capNoticeId : undefined}
        onClick={() => onChange(quantity + 1)}
        aria-label={`More copies of ${title}`}
      >
        {'+'}
      </button>
    </div>
  )
}

export function CartPage() {
  const { refresh } = useCartBadge()
  const [lines, setLines] = useState<CartLine[]>([])
  const [goodsTotal, setGoodsTotal] = useState(0)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const loadController = useRef<AbortController | null>(null)
  const hasLoaded = useRef(false)

  /**
   * Fetches `/api/cart`, aborting any earlier fetch. Current lines stay up until the
   * answer lands. A superseded fetch does nothing; the newer one settles the status.
   */
  const loadCart = useCallback(async (): Promise<LoadOutcome> => {
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller

    const fail = (message: string, malformed: boolean): LoadOutcome => {
      if (!hasLoaded.current || malformed) {
        setErrorMessage(message)
        setStatus('error')
      } else {
        // Keep the last good cart on screen; never leave a refetch stuck on the spinner.
        setActionError(message)
        setStatus('ready')
      }
      return 'failed'
    }

    try {
      const response = await fetch('/api/cart', {
        credentials: 'include',
        signal: controller.signal,
      })
      const body = (await response.json().catch(() => null)) as unknown
      if (controller.signal.aborted) return 'aborted'
      if (!response.ok) return fail(apiMessage(body as ApiError | null, LOAD_FAILED), false)
      const snapshot: CartSnapshot | undefined = parseCartBody(body)
      if (!snapshot) return fail(LOAD_FAILED, true)
      setLines(snapshot.lines)
      setGoodsTotal(snapshot.goodsTotal)
      setStatus('ready')
      hasLoaded.current = true
      return 'ok'
    } catch {
      if (controller.signal.aborted) return 'aborted'
      return fail(UNREACHABLE, false)
    } finally {
      if (loadController.current === controller) loadController.current = null
    }
  }, [])

  useEffect(() => {
    setStatus('loading')
    setErrorMessage('')
    void loadCart().then((outcome) => {
      if (outcome === 'ok') refresh()
    })
    return () => loadController.current?.abort()
  }, [loadCart, refresh])

  /** Runs one edit or refresh at a time; the ref blocks re-entry before React re-renders. */
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

  const runEdit = (url: string, init: RequestInit, fallback: string) =>
    void withLock(async () => {
      let response: Response
      try {
        response = await fetch(url, { credentials: 'include', ...init })
      } catch {
        setActionError(UNREACHABLE)
        return
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiError | null
        setActionError(apiMessage(body, fallback))
        // Resync with the server so what is shown matches it, e.g. a line removed elsewhere.
        await loadCart()
        refresh()
        return
      }
      await loadCart()
      refresh()
    })

  const setMemberQuantity = (lineId: number, bookId: number, quantity: number) =>
    runEdit(
      `/api/cart/packs/${lineId}/members/${bookId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quantity }),
      },
      'Could not change that quantity.',
    )

  const setItemQuantity = (lineId: number, quantity: number) =>
    runEdit(
      `/api/cart/items/${lineId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quantity }),
      },
      'Could not change that quantity.',
    )

  const removeLine = (line: CartLine) =>
    runEdit(
      line.kind === 'pack' ? `/api/cart/packs/${line.id}` : `/api/cart/items/${line.id}`,
      { method: 'DELETE' },
      'Could not remove that line.',
    )

  const refreshCart = () =>
    void withLock(async () => {
      if ((await loadCart()) === 'ok') refresh()
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
  if (status === 'loading') return <Spinner />

  return (
    <section className="cart-screen">
      <h1 className="page-heading text-heading-lg">Cart</h1>
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
            aria-label="Refresh cart"
            disabled={busy}
            onClick={refreshCart}
          >
            <RefreshIcon width={24} height={24} />
          </button>
        </div>
      ) : (
        <>
          <ul className="cart-line-list">
            {lines.map((line) =>
              line.kind === 'pack' ? (
                <li key={`pack-${line.id}`} className="cart-line">
                  <span
                    className={
                      line.sequence === 1 ? 'cart-line-chip is-first' : 'cart-line-chip is-later'
                    }
                  >
                    {line.label}
                  </span>
                  <p className="cart-line-meta text-meta">{compositionMeta(line)}</p>
                  <ul className="cart-member-list">
                    {line.members
                      .filter((member) => member.included)
                      .map((member) => {
                        const capNoticeId = `cart-cap-${line.id}-${member.bookId}`
                        return (
                          <li key={member.bookId} className="cart-member">
                            <div className="cart-member-main">
                              <span className="text-body-strong">{member.title}</span>
                              <span className="cart-member-unit text-meta">
                                {formatRupees(member.unitPrice)} each
                              </span>
                            </div>
                            <div className="pack-row-controls">
                              <QuantityStepper
                                title={member.title}
                                quantity={member.quantity}
                                disabled={busy}
                                capNoticeId={capNoticeId}
                                onChange={(quantity) =>
                                  setMemberQuantity(line.id, member.bookId, quantity)
                                }
                              />
                              <span className="text-amount-row">
                                {formatRupees(member.quantity * member.unitPrice)}
                              </span>
                            </div>
                            {member.quantity >= QUANTITY_MAX ? (
                              <p className="pack-row-notice text-meta" id={capNoticeId}>
                                {CAP_COPY}
                              </p>
                            ) : null}
                          </li>
                        )
                      })}
                  </ul>
                  <div className="cart-line-footer">
                    <button
                      type="button"
                      className="button-danger-text"
                      disabled={busy}
                      onClick={() => removeLine(line)}
                      aria-label={`Remove ${line.label}`}
                    >
                      Remove
                    </button>
                    <span className="cart-line-total text-amount-row">
                      {formatRupees(line.lineTotal)}
                    </span>
                  </div>
                </li>
              ) : (
                <li key={`item-${line.id}`} className="cart-line">
                  <p className="cart-item-line text-body-strong">{line.title}</p>
                  <p className="cart-member-unit text-meta">{formatRupees(line.unitPrice)} each</p>
                  <div className="pack-row-controls">
                    <QuantityStepper
                      title={line.title}
                      quantity={line.quantity}
                      disabled={busy}
                      capNoticeId={`cart-cap-item-${line.id}`}
                      onChange={(quantity) => setItemQuantity(line.id, quantity)}
                    />
                  </div>
                  {line.quantity >= QUANTITY_MAX ? (
                    <p className="pack-row-notice text-meta" id={`cart-cap-item-${line.id}`}>
                      {CAP_COPY}
                    </p>
                  ) : null}
                  <div className="cart-line-footer">
                    <button
                      type="button"
                      className="button-danger-text"
                      disabled={busy}
                      onClick={() => removeLine(line)}
                      aria-label={`Remove ${line.title}`}
                    >
                      Remove
                    </button>
                    <span className="cart-line-total text-amount-row">
                      {formatRupees(line.lineTotal)}
                    </span>
                  </div>
                </li>
              ),
            )}
          </ul>
          <div className="cart-goods-total" aria-live="polite">
            <span className="text-body-strong">Goods total</span>
            <span className="cart-goods-total-amount text-amount-row">
              {formatRupees(goodsTotal)}
            </span>
          </div>
          <Link className="button-primary cart-checkout" to="/cart/checkout">
            Checkout
          </Link>
        </>
      )}
    </section>
  )
}
