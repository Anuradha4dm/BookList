import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Spinner, formatRupees } from '@booklist/ui'
import { AuthSurface } from './AuthGate'
import { useSession } from './auth'
import { browseItemsPath, type BrowseItem } from './browse'
import { useCartBadge } from './cart'
import { QUANTITY_MAX, QUANTITY_MIN } from './packConfig'

const EMPTY_COPY = 'we are working on this now'
const UNREACHABLE = 'Could not reach the shop. Try again.'
const CAP_COPY = 'Item count exeeded, you can only order 20 per item'

type ApiError = {
  error?: { code?: string; message?: string }
}

type Quantities = Record<number, number>

export function ItemsPage() {
  const session = useSession()
  const { refresh: refreshCartBadge } = useCartBadge()
  const [items, setItems] = useState<BrowseItem[] | null>(null)
  const [error, setError] = useState('')
  const [quantities, setQuantities] = useState<Quantities>({})
  const [needsAuth, setNeedsAuth] = useState(false)
  const [addError, setAddError] = useState('')
  const [addingId, setAddingId] = useState<number | null>(null)
  const addingRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    void fetch(browseItemsPath(), { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('load failed')
        return (await response.json()) as BrowseItem[]
      })
      .then((list) => {
        setItems(list)
        setError('')
        setQuantities((current) => {
          const next: Quantities = {}
          for (const item of list) {
            next[item.id] = current[item.id] ?? QUANTITY_MIN
          }
          return next
        })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setItems([])
        setError(UNREACHABLE)
        void err
      })
    return () => controller.abort()
  }, [])

  function quantityFor(itemId: number): number {
    return quantities[itemId] ?? QUANTITY_MIN
  }

  function setQuantity(itemId: number, quantity: number): void {
    setQuantities((current) => ({ ...current, [itemId]: quantity }))
  }

  async function addToCart(item: BrowseItem): Promise<void> {
    setAddError('')
    if (session.status !== 'in') {
      setNeedsAuth(true)
      return
    }
    if (addingRef.current) return
    addingRef.current = true
    setAddingId(item.id)
    const quantity = quantityFor(item.id)
    try {
      const response = await fetch('/api/cart/items', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, quantity }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiError | null
        const message = body?.error?.message
        setAddError(
          typeof message === 'string' && message.trim() ? message : 'Could not add this item.',
        )
        return
      }
      refreshCartBadge()
    } catch {
      setAddError(UNREACHABLE)
    } finally {
      addingRef.current = false
      setAddingId(null)
    }
  }

  const ready = items !== null
  const empty = ready && items.length === 0 && !error

  return (
    <section>
      {needsAuth && session.status !== 'in' ? (
        <div className="pack-auth">
          <AuthSurface
            onSignedIn={() => setNeedsAuth(false)}
            headingNote="Log in or create an account to add this item. Your quantity stays on this screen."
          />
        </div>
      ) : null}
      <h1 className="page-heading text-heading-lg">Items</h1>
      <p className="text-meta">
        <Link to="/">Packs</Link>
      </p>
      {error ? (
        <p className="form-error text-meta" role="alert">
          {error}
        </p>
      ) : null}
      {!ready ? <Spinner /> : null}
      {empty ? <p className="text-meta">{EMPTY_COPY}</p> : null}
      {ready && items.length > 0 ? (
        <ul className="catalog-list">
          {items.map((item) => {
            const quantity = quantityFor(item.id)
            const atCap = quantity >= QUANTITY_MAX
            const atFloor = quantity <= QUANTITY_MIN
            const capNoticeId = `item-cap-${item.id}`
            return (
              <li key={item.id} className="catalog-row">
                <p className="catalog-row-name">{item.title}</p>
                <p className="text-meta">{item.description}</p>
                <p className="text-amount-row">{formatRupees(item.price)}</p>
                <div className="pack-row-controls">
                  <div className="pack-stepper">
                    <button
                      type="button"
                      className="pack-stepper-end"
                      disabled={atFloor}
                      onClick={() => setQuantity(item.id, quantity - 1)}
                      aria-label={`Fewer of ${item.title}`}
                    >
                      {'\u2212'}
                    </button>
                    <span className="pack-stepper-value text-amount-row">{quantity}</span>
                    <button
                      type="button"
                      className="pack-stepper-end"
                      disabled={atCap}
                      aria-describedby={atCap ? capNoticeId : undefined}
                      onClick={() => setQuantity(item.id, quantity + 1)}
                      aria-label={`More of ${item.title}`}
                    >
                      {'+'}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="button-primary press-travel"
                    disabled={addingId === item.id}
                    onClick={() => void addToCart(item)}
                  >
                    Add
                  </button>
                </div>
                {atCap ? (
                  <p className="pack-row-notice text-meta" id={capNoticeId}>
                    {CAP_COPY}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {addError ? (
        <p className="form-error text-meta" role="alert">
          {addError}
        </p>
      ) : null}
    </section>
  )
}
